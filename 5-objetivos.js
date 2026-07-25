// ==========================================
// 5-objetivos.js (FINAL: CORRECCIÓN VALORES 0)
// ==========================================

// Definimos el orden fiscal correcto
window.mesesFiscales = [
    "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre",
    "Octubre", "Noviembre", "Diciembre",
    "Enero", "Febrero", "Marzo"
];

// Gestión de gráficas para limpieza de memoria
window.objectiveCharts = [];

window.getCurrentFiscalYear = () => {
    const now = new Date();
    return now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
};

window.anioFiscalSeleccionado = window.getCurrentFiscalYear();

// --- HELPER PARA VALIDAR NÚMEROS (ACEPTA 0) ---
window.parseOrVal = (val, defaultVal) => {
    if (val !== undefined && val !== null && val !== "") {
        return parseFloat(val);
    }
    return defaultVal;
};

// --- OBTENER CATEGORÍAS ---
window.obtenerCategoriasExistentes = async (userId) => {
    const { data } = await sb.from('objectives').select('category').eq('employee_id', userId);
    if (!data) return [];
    const unique = [...new Set(data.map(item => item.category).filter(c => c))];
    return unique.sort();
};

// --- VISTA PRINCIPAL ---
window.cargarVistaObjetivos = async () => {
    const elementsToHide = [
        'init-load-container', 'global-stats', 'container-incidentes',
        'container-evaluaciones', 'container-evaluaciones-historial',
        'search-bar-container', 'admin-toolbar', 'quick-team-view',
        'container-estructura', 'container-ultimos-incidentes', 'main-user-header'
    ];
    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.style.display = 'none';
        if(btnLogout.parentElement) btnLogout.parentElement.style.display = 'none';
    }

    // --- PREPARAR CONTENEDOR FULL SCREEN ---
    let container = document.getElementById('container-objetivos');
    if (!container) {
        container = document.createElement('div');
        container.id = 'container-objetivos';
        document.body.appendChild(container);
    }
    
    // --- ESTILOS FULL SCREEN REAL ---
    Object.assign(container.style, {
        display: 'block',
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: '#f8fafc',
        zIndex: '1500',
        padding: '0',
        boxSizing: 'border-box'
    });

    const baseYear = window.getCurrentFiscalYear();
    const years = [baseYear - 1, baseYear, baseYear + 1];
    let optionsHtml = years.map(y => `<option value="${y}" ${y === window.anioFiscalSeleccionado ? 'selected' : ''}>Ciclo ${y} - ${y+1}</option>`).join('');

    container.innerHTML = `
        <div style="width: 100%;"> 
            <div style="
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                padding: 15px 30px; 
                background: rgba(255, 255, 255, 0.95); 
                backdrop-filter: blur(10px);
                border-bottom: 1px solid #e2e8f0; 
                position: sticky; 
                top: 0; 
                z-index: 20;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
            ">
                <div style="display:flex; align-items:center; gap:20px;">
                    <button onclick="window.mostrarDashboard(JSON.parse(localStorage.getItem('usuarioLogueado')))" 
                        style="background: transparent; border: 1px solid #e2e8f0; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; transition: all 0.2s;"
                        onmouseover="this.style.background='#f1f5f9'; this.style.color='#0f172a'"
                        onmouseout="this.style.background='transparent'; this.style.color='#64748b'"
                        title="Volver"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>

                    <div style="display:flex; align-items:center; gap: 12px; flex-wrap: wrap;">
                        <h2 style="color: #0f172a; margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px;">Objetivos</h2>
                        <div style="position: relative;">
                            <select id="selector-anio-fiscal" onchange="window.cambiarAnioVisualizacion(this.value)" 
                                style="appearance: none; background-color: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px 32px 6px 14px; border-radius: 20px; font-weight: 600; color: #475569; font-size: 0.85rem; cursor: pointer; outline: none; font-family: inherit; transition: all 0.2s;"
                                onmouseover="this.style.backgroundColor='#e2e8f0'"
                                onmouseout="this.style.backgroundColor='#f1f5f9'"
                            >
                                ${optionsHtml}
                            </select>
                            <div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid #64748b;"></div>
                        </div>
                    </div>
                </div>

                <button onclick="window.abrirModalObjetivo()" style="
                    background: #0f766e; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(15, 118, 110, 0.2); font-size: 0.9rem; display: flex; align-items: center; gap: 6px; transition: transform 0.1s;"
                onmousedown="this.style.transform='scale(0.97)'"
                onmouseup="this.style.transform='scale(1)'"
                >
                    <span style="font-size:1.1rem; line-height:0;">+</span> Nuevo
                </button>
            </div>
            
            <div style="padding: 30px;">
                <div id="lista-objetivos-content" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(450px, 1fr)); gap: 25px; width: 100%;">
                    <div style="grid-column: 1 / -1; text-align:center; padding:40px; color:#94a3b8;"><div class="spinner"></div> Cargando metas...</div>
                </div>
            </div>
        </div>
    `;

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    await window.renderizarListaObjetivos(user.id, window.anioFiscalSeleccionado);
};

window.cambiarAnioVisualizacion = (newYear) => {
    window.anioFiscalSeleccionado = parseInt(newYear);
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    document.getElementById('lista-objetivos-content').innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding:40px; color:#94a3b8;"><div class="spinner"></div> Cambiando ciclo...</div>`;
    window.renderizarListaObjetivos(user.id, window.anioFiscalSeleccionado);
};

// --- RENDERIZADO DE TARJETAS ---
window.renderizarListaObjetivos = async (userId, year) => {
    if (window.objectiveCharts) {
        window.objectiveCharts.forEach(chart => chart.destroy());
        window.objectiveCharts = [];
    }

    const listContainer = document.getElementById('lista-objetivos-content');
    
    const { data: objetivos, error } = await sb.from('objectives')
        .select('*')
        .eq('employee_id', userId)
        .eq('year', year)
        .order('created_at', { ascending: false });

    if (error || !objetivos || objetivos.length === 0) {
        listContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; background:white; border-radius:16px; border:1px dashed #cbd5e1;">
                <div style="font-size:3rem; opacity:0.2; margin-bottom:10px;">📂</div>
                <div style="color:#64748b; font-size:1.1rem; margin-bottom:5px;">Sin objetivos para este ciclo</div>
                <div style="color:#94a3b8; font-size:0.9rem;">Selecciona otro año o crea una nueva meta.</div>
                <button onclick="window.abrirModalObjetivo()" style="margin-top:20px; color:#0f766e; background:transparent; border:1px solid #0f766e; padding:8px 20px; border-radius:8px; cursor:pointer; font-weight:600;">Crear objetivo ahora</button>
            </div>`;
        return;
    }

    listContainer.innerHTML = '';

    objetivos.forEach(obj => {
        const progressData = obj.progress_data || {};
        const commentsData = obj.comments_data || {};
        const targetsData = obj.targets_data || {};
        const commitmentsData = obj.commitments_data || {};
        
        const isPct = (obj.unit_type === 'percentage');
        const symbol = isPct ? '%' : '';
        const category = obj.category || 'General';
        
        const initialLetter = category.charAt(0).toUpperCase();

        // 1. CORRECCIÓN GLOBAL: Usar helper para aceptar 0
        const globalTarget = window.parseOrVal(obj.target_value, 100);
        const globalCommit = window.parseOrVal(obj.commitment_value, 0);
        const isInverse = (obj.is_inverse === true);

        // Calcular último valor
        let currentProgress = 0;
        let lastMonth = "Inicio";
        for (let i = window.mesesFiscales.length - 1; i >= 0; i--) {
            const mes = window.mesesFiscales[i];
            if (progressData[mes] !== undefined && progressData[mes] !== null && progressData[mes] !== "") {
                currentProgress = parseFloat(progressData[mes]);
                lastMonth = mes;
                break;
            }
        }

        // --- CALCULAR METAS DEL MES ACTUAL (CORREGIDO PARA 0) ---
        let currentTarget = globalTarget;
        let currentCommit = globalCommit;
        
        // 2. CORRECCIÓN MENSUAL: Validar explícitamente undefined/null para permitir 0
        if(lastMonth !== "Inicio") {
            currentTarget = window.parseOrVal(targetsData[lastMonth], globalTarget);
            currentCommit = window.parseOrVal(commitmentsData[lastMonth], globalCommit);
        }

        // --- LÓGICA DE SEMÁFORO TARJETA ---
        let color = '#ef4444';
        if (!isInverse) {
            if (currentProgress >= currentTarget) color = '#10b981';
            else if (currentProgress >= currentCommit) color = '#facc15';
            else if (currentProgress > 0) color = '#3b82f6';
            else color = '#ef4444';
        } else {
            if (currentProgress <= currentTarget) color = '#10b981';
            else if (currentProgress <= currentCommit) color = '#facc15';
            else color = '#ef4444';
        }

        const card = document.createElement('div');
        card.className = 'incident-card';
        card.style.padding = '25px';
        card.style.borderLeft = `5px solid ${color}`;
        card.style.backgroundColor = 'white';
        card.style.borderRadius = '16px';
        card.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)';
        card.style.transition = 'transform 0.2s';
        card.onmouseover = () => card.style.transform = 'translateY(-2px)';
        card.onmouseout = () => card.style.transform = 'translateY(0)';
        
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                <div style="display:flex; flex:1; padding-right:15px;">
                    <div style="font-size: 3.8rem; font-weight: 900; color: #e2e8f0; line-height: 0.8; margin-right: 18px; margin-top: -2px; text-transform: uppercase; user-select: none; font-family: 'Segoe UI', system-ui, sans-serif;">
                        ${initialLetter}
                    </div>
                    <div>
                        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:8px;">
                            <span style="background:#f8fafc; color:#64748b; font-size:0.7rem; padding:3px 8px; border-radius:6px; font-weight:700; border:1px solid #e2e8f0; text-transform:uppercase; letter-spacing:0.5px;">${category}</span>
                            <span style="background:${isPct ? '#eff6ff' : '#f5f3ff'}; color:${isPct ? '#3b82f6' : '#8b5cf6'}; font-size:0.7rem; padding:3px 8px; border-radius:6px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">${isPct ? 'Porcentaje' : 'Cantidad'}</span>
                        </div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700; line-height:1.3;">${obj.title}</h3>
                        <div style="color:#64748b; font-size:0.95rem; margin-top:4px;">${obj.description || 'Sin descripción'}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.8rem; font-weight:800; color:${color}; line-height:1;">${currentProgress}${symbol}</div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px; font-weight:500;">${lastMonth}</div>
                </div>
            </div>

            <div style="position: relative; height: 220px; width: 100%; margin-bottom: 20px;">
                <canvas id="chart-obj-${obj.id}"></canvas>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:15px;">
                <div style="font-size:0.85rem; color:#64748b; display:flex; gap:20px;">
                    <span title="Meta Base">Meta: <b style="color:#0f172a;">${globalTarget}${symbol}</b></span>
                    <span title="Compromiso Base">Comp: <b style="color:#0f172a;">${globalCommit}${symbol}</b></span>
                </div>
                <button onclick='window.abrirModalAvance(${JSON.stringify(obj).replace(/'/g, "&#39;")})' 
                    style="background: white; border: 1px solid #e2e8f0; color: #0f766e; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;"
                    onmouseover="this.style.borderColor='#0f766e'; this.style.background='#f0fdfa'"
                    onmouseout="this.style.borderColor='#e2e8f0'; this.style.background='white'"
                >Actualizar</button>
            </div>
        `;
        listContainer.appendChild(card);

        // --- PREPARAR DATOS GRÁFICA ---
        const ctx = document.getElementById(`chart-obj-${obj.id}`).getContext('2d');
        const chartLabels = window.mesesFiscales.map(m => m.substring(0,3));
        
        // 3. CORRECCIÓN GRÁFICA: Mapeo de datos respetando 0
        const dataTarget = window.mesesFiscales.map(m => window.parseOrVal(targetsData[m], globalTarget));
        const dataCommit = window.mesesFiscales.map(m => window.parseOrVal(commitmentsData[m], globalCommit));

        const chartData = window.mesesFiscales.map(m => {
            const val = progressData[m];
            return (val !== undefined && val !== null && val !== "") ? parseFloat(val) : null;
        });

        const chartComments = window.mesesFiscales.map(m => commentsData[m] || null);

        // --- COLOR DE PUNTOS ---
        const pointColors = chartData.map((val, idx) => {
            if (val === null) return 'transparent';
            const monthlyCommit = dataCommit[idx];
            
            if (!isInverse) {
                if (val > monthlyCommit) return '#10b981';
                if (val == monthlyCommit) return '#facc15';
                return '#ef4444';
            } else {
                if (val < monthlyCommit) return '#10b981';
                if (val == monthlyCommit) return '#facc15';
                return '#ef4444';
            }
        });

        // Plugin: Flecha Gradiente
        const pluginFlechaY = {
            id: 'customYArrow',
            afterDraw: (chart) => {
                const { ctx, scales: { y } } = chart;
                const xPos = y.left;
                const yTop = y.top;
                const yBottom = y.bottom;
                
                ctx.save();
                const gradiente = ctx.createLinearGradient(0, yBottom, 0, yTop);
                if (!isInverse) {
                    gradiente.addColorStop(0, '#ef4444'); gradiente.addColorStop(0.45, '#facc15'); gradiente.addColorStop(0.55, '#facc15'); gradiente.addColorStop(1, '#10b981');
                } else {
                    gradiente.addColorStop(0, '#10b981'); gradiente.addColorStop(0.45, '#facc15'); gradiente.addColorStop(0.55, '#facc15'); gradiente.addColorStop(1, '#ef4444');
                }
                ctx.strokeStyle = gradiente; ctx.fillStyle = gradiente; ctx.lineWidth = 12;
                
                const arrowHeight = 20; const arrowWidth = 14;
                ctx.beginPath();
                if (!isInverse) {
                    ctx.moveTo(xPos, yBottom); ctx.lineTo(xPos, yTop); ctx.stroke(); ctx.beginPath(); ctx.moveTo(xPos, yTop - arrowHeight); ctx.lineTo(xPos - arrowWidth, yTop); ctx.lineTo(xPos + arrowWidth, yTop); ctx.closePath(); ctx.fill();
                } else {
                    ctx.moveTo(xPos, yTop); ctx.lineTo(xPos, yBottom); ctx.stroke(); ctx.beginPath(); ctx.moveTo(xPos, yBottom + arrowHeight); ctx.lineTo(xPos - arrowWidth, yBottom); ctx.lineTo(xPos + arrowWidth, yBottom); ctx.closePath(); ctx.fill();
                }
                ctx.restore();
            }
        };

        const newChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Avance',
                        data: chartData,
                        borderColor: color,
                        backgroundColor: color,
                        borderWidth: 3,
                        tension: 0.3,
                        pointBackgroundColor: pointColors,
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        spanGaps: true
                    },
                    {
                        label: 'Meta',
                        data: dataTarget,
                        borderColor: '#10b981',
                        borderWidth: 2,
                        borderDash: [6, 6],
                        pointRadius: 0,
                        fill: false,
                        stepped: false
                    },
                    {
                        label: 'Compromiso',
                        data: dataCommit,
                        borderColor: '#facc15',
                        borderWidth: 2,
                        borderDash: [3, 3],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            plugins: [pluginFlechaY],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 35, bottom: 25, right: 20, left: 15 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index', intersect: false, backgroundColor: 'rgba(15, 23, 42, 0.95)', padding: 10, cornerRadius: 8,
                        callbacks: {
                            afterLabel: (context) => {
                                if (context.datasetIndex === 0) {
                                    const index = context.dataIndex;
                                    const comment = chartComments[index];
                                    if (comment) return `💬 ${comment}`;
                                }
                                return null;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false },
                        ticks: { padding: 20, font: { weight: 'bold', size: 11 }, color: '#64748b' }
                    },
                    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
        window.objectiveCharts.push(newChart);
    });
};

// --- MODAL CREAR ---
window.abrirModalObjetivo = async () => {
    if (!document.getElementById('modal-nuevo-objetivo')) {
        const modalHtml = `
        <div id="modal-nuevo-objetivo" style="display:none; position:fixed; z-index:2000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); align-items:center; justify-content:center;">
            <div class="form-content" style="max-width:450px; animation:scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <h2 style="color:#0f766e; margin-top:0;">Nuevo Objetivo</h2>
                <div id="aviso-anio-creacion" style="background:#f0fdf4; border:1px dashed #16a34a; padding:10px; border-radius:8px; margin-bottom:15px; font-size:0.85rem; color:#166534;"></div>
                
                <div class="form-group"><label>Título:</label><input type="text" id="obj-titulo" placeholder="Ej. Accidentes laborales"></div>
                
                <div class="form-group">
                    <label>Categoría:</label>
                    <input list="dl-categorias" id="obj-category" placeholder="Escribe o selecciona..." style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
                    <datalist id="dl-categorias"></datalist>
                </div>
                
                <div class="form-group"><label>Descripción:</label><textarea id="obj-desc" rows="2"></textarea></div>
                
                <div style="display:flex; gap:10px;">
                    <div class="form-group" style="flex:1;"><label>Unidad:</label><select id="obj-type" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;"><option value="percentage">Porcentaje (%)</option><option value="number">Cantidad (#)</option></select></div>
                </div>

                <div class="form-group" style="display:flex; align-items:center; gap:10px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-top:5px;">
                    <input type="checkbox" id="obj-inverse" style="width:18px; height:18px; cursor:pointer;">
                    <label for="obj-inverse" style="cursor:pointer; font-size:0.9rem; color:#334155; user-select:none;"><b>Menos es mejor</b> (ej. Reducir mermas)</label>
                </div>
                
                <div style="display:flex; gap:15px; margin-top:15px;">
                    <div class="form-group" style="flex:1;"><label style="color:#0f766e; font-weight:bold;">Meta Anual:</label><input type="number" id="obj-target" value="100"></div>
                    <div class="form-group" style="flex:1;"><label style="color:#b45309; font-weight:bold;">Comp. Anual:</label><input type="number" id="obj-commit" value="80"></div>
                </div>
                
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                    <button onclick="document.getElementById('modal-nuevo-objetivo').style.display='none'" style="padding:10px; background:white; border:none; cursor:pointer; color:#64748b;">Cancelar</button>
                    <button onclick="window.guardarObjetivo()" style="padding:10px 20px; background:#0f766e; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Crear</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const cats = await window.obtenerCategoriasExistentes(user.id);
    const dl = document.getElementById('dl-categorias');
    dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
    const y = window.anioFiscalSeleccionado;
    document.getElementById('aviso-anio-creacion').innerHTML = `Ciclo Fiscal: <b>${y} - ${y+1}</b>`;
    document.getElementById('obj-titulo').value = '';
    document.getElementById('obj-category').value = '';
    document.getElementById('obj-desc').value = '';
    document.getElementById('obj-type').value = 'percentage';
    document.getElementById('obj-inverse').checked = false;
    document.getElementById('obj-target').value = '100';
    document.getElementById('obj-commit').value = '80';
    document.getElementById('modal-nuevo-objetivo').style.display = 'flex';
};

window.guardarObjetivo = async () => {
    const titulo = document.getElementById('obj-titulo').value;
    const cat = document.getElementById('obj-category').value || 'General';
    const desc = document.getElementById('obj-desc').value;
    const type = document.getElementById('obj-type').value;
    const isInverse = document.getElementById('obj-inverse').checked;
    
    let target = document.getElementById('obj-target').value;
    if (target === '') target = 100;
    
    let commit = document.getElementById('obj-commit').value;
    if (commit === '') commit = 0;

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    if(!titulo) return alert("El título es obligatorio");
    const btn = document.querySelector('#modal-nuevo-objetivo button[onclick*="guardar"]');
    btn.disabled = true; btn.innerText = "Guardando...";
    
    const { error } = await sb.from('objectives').insert({
        employee_id: user.id, year: window.anioFiscalSeleccionado,
        title: titulo, category: cat, description: desc,
        target_value: target, commitment_value: commit, unit_type: type,
        is_inverse: isInverse,
        progress_data: {},
        comments_data: {},
        targets_data: {},
        commitments_data: {}
    });
    
    btn.disabled = false; btn.innerText = "Crear";
    if(error) alert("Error: " + error.message);
    else { document.getElementById('modal-nuevo-objetivo').style.display = 'none'; window.cargarVistaObjetivos(); }
};

// --- MODAL ACTUALIZAR MES (CON EDICIÓN AVANZADA) ---
window.abrirModalAvance = (obj) => {
    if (!document.getElementById('modal-update-avance')) {
        const modalHtml = `
        <div id="modal-update-avance" style="display:none; position:fixed; z-index:2000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); align-items:center; justify-content:center;">
            <div class="form-content" style="max-width:550px; max-height:85vh; overflow-y:auto; animation:scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                
                <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                    <div>
                        <h3 style="color:#0f766e; margin:0;" id="avance-titulo-obj">Actualizar Progreso</h3>
                        <div style="display:flex; gap:10px; margin-top:5px; font-size:0.8rem; color:#64748b;">
                            <span>Meta Base: <b id="avance-target-display"></b></span>
                            <span>Comp Base: <b id="avance-commit-display"></b></span>
                        </div>
                    </div>
                    <button id="btn-edit-inside-modal" style="background:white; border:1px solid #cbd5e1; border-radius:6px; padding:6px 10px; font-size:0.8rem; cursor:pointer; color:#475569; display:flex; align-items:center; gap:5px;">
                        ✏️ Editar General
                    </button>
                </div>

                <input type="hidden" id="avance-obj-id">
                <div id="grid-meses" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:15px;"></div>
                
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:15px;">
                    <button onclick="document.getElementById('modal-update-avance').style.display='none'" style="padding:10px; background:white; border:none; cursor:pointer; color:#64748b;">Cerrar</button>
                    <button onclick="window.guardarAvance()" style="padding:10px 20px; background:#0f766e; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Guardar Cambios</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    document.getElementById('avance-titulo-obj').innerText = obj.title;
    document.getElementById('avance-obj-id').value = obj.id;
    
    const isPct = obj.unit_type === 'percentage';
    const symbol = isPct ? '%' : '';
    document.getElementById('avance-target-display').innerText = `${obj.target_value}${symbol}`;
    const commitVal = (obj.commitment_value !== null) ? obj.commitment_value : 0;
    document.getElementById('avance-commit-display').innerText = `${commitVal}${symbol}`;

    document.getElementById('btn-edit-inside-modal').onclick = () => {
        document.getElementById('modal-update-avance').style.display = 'none';
        window.abrirModalEditar(obj);
    };

    const grid = document.getElementById('grid-meses');
    grid.innerHTML = '';
    
    // Obtenemos todos los datos
    const data = obj.progress_data || {};
    const comments = obj.comments_data || {};
    const tData = obj.targets_data || {};
    const cData = obj.commitments_data || {};

    window.mesesFiscales.forEach((mes, index) => {
        const val = data[mes] !== undefined ? data[mes] : '';
        const commentVal = comments[mes] !== undefined ? comments[mes] : '';
        const targetVal = tData[mes] !== undefined ? tData[mes] : '';
        const commitValSpecific = cData[mes] !== undefined ? cData[mes] : '';
        
        let labelExtra = "";
        if (["Enero", "Febrero", "Marzo"].includes(mes)) { labelExtra = `<span style="font-size:0.65rem; color:#94a3b8; font-weight:normal;">(+1)</span>`; }
        const ph = isPct ? '%' : '#';
        
        grid.innerHTML += `
            <div style="background:#f8fafc; padding:12px; border-radius:10px; border:1px solid #e2e8f0;">
                <div style="font-size:0.85rem; color:#334155; font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between;">
                    <span>${index + 1}. ${mes} ${labelExtra}</span>
                </div>
                
                <div style="display:flex; gap:8px; flex-direction:column;">
                    <input type="number" class="inp-mes-avance" data-mes="${mes}" value="${val}" placeholder="Valor Real (${ph})" 
                        style="width:100%; box-sizing:border-box; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-size:1.1rem; text-align:center; outline:none; font-weight:bold; color:#0f766e;">
                    
                    <div style="display:flex; gap:5px;">
                        <div style="flex:1;">
                            <label style="font-size:0.65rem; color:#64748b; font-weight:600;">Meta Mes</label>
                            <input type="number" class="inp-mes-target" data-mes="${mes}" value="${targetVal}" placeholder="(${obj.target_value})" 
                            style="width:100%; padding:5px; border:1px solid #e2e8f0; border-radius:4px; font-size:0.75rem; text-align:center;">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:0.65rem; color:#64748b; font-weight:600;">Comp Mes</label>
                            <input type="number" class="inp-mes-commit" data-mes="${mes}" value="${commitValSpecific}" placeholder="(${obj.commitment_value})" 
                            style="width:100%; padding:5px; border:1px solid #e2e8f0; border-radius:4px; font-size:0.75rem; text-align:center;">
                        </div>
                    </div>

                    <textarea class="inp-mes-comentario" data-mes="${mes}" placeholder="💬 Agregar comentario..." rows="1"
                        style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.85rem; outline:none; resize:none; font-family:inherit; background:white;">${commentVal}</textarea>
                </div>
            </div>
        `;
    });
    document.getElementById('modal-update-avance').style.display = 'flex';
};

// --- MODAL EDITAR GENERAL ---
window.abrirModalEditar = async (obj) => {
    if (!document.getElementById('modal-editar-objetivo')) {
        const modalHtml = `
        <div id="modal-editar-objetivo" style="display:none; position:fixed; z-index:2000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); align-items:center; justify-content:center;">
            <div class="form-content" style="max-width:450px; animation:scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <h2 style="color:#0f766e; margin-top:0;">Editar Objetivo</h2>
                <input type="hidden" id="edit-obj-id">
                <div class="form-group"><label>Título:</label><input type="text" id="edit-obj-titulo"></div>
                <div class="form-group">
                    <label>Categoría:</label>
                    <input list="dl-categorias-edit" id="edit-obj-category" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
                    <datalist id="dl-categorias-edit"></datalist>
                </div>
                <div class="form-group"><label>Descripción:</label><textarea id="edit-obj-desc" rows="2"></textarea></div>
                <div class="form-group"><label>Unidad:</label><select id="edit-obj-type" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;"><option value="percentage">Porcentaje (%)</option><option value="number">Cantidad (#)</option></select></div>
                
                <div class="form-group" style="display:flex; align-items:center; gap:10px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-top:5px;">
                    <input type="checkbox" id="edit-obj-inverse" style="width:18px; height:18px; cursor:pointer;">
                    <label for="edit-obj-inverse" style="cursor:pointer; font-size:0.9rem; color:#334155;"><b>Menos es mejor</b></label>
                </div>

                <div style="display:flex; gap:15px; margin-top:15px;">
                    <div class="form-group" style="flex:1;"><label style="color:#0f766e; font-weight:bold;">Meta Anual:</label><input type="number" id="edit-obj-target"></div>
                    <div class="form-group" style="flex:1;"><label style="color:#b45309; font-weight:bold;">Comp. Anual:</label><input type="number" id="edit-obj-commit"></div>
                </div>
                
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                    <button onclick="document.getElementById('modal-editar-objetivo').style.display='none'" style="padding:10px; background:white; border:none; cursor:pointer; color:#64748b;">Cancelar</button>
                    <button onclick="window.guardarEdicion()" style="padding:10px 20px; background:#0f766e; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Guardar Cambios</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const cats = await window.obtenerCategoriasExistentes(user.id);
    const dl = document.getElementById('dl-categorias-edit');
    dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
    
    document.getElementById('edit-obj-id').value = obj.id;
    document.getElementById('edit-obj-titulo').value = obj.title;
    document.getElementById('edit-obj-category').value = obj.category || '';
    document.getElementById('edit-obj-desc').value = obj.description || '';
    document.getElementById('edit-obj-type').value = obj.unit_type || 'percentage';
    document.getElementById('edit-obj-inverse').checked = (obj.is_inverse === true);
    document.getElementById('edit-obj-target').value = obj.target_value;
    document.getElementById('edit-obj-commit').value = obj.commitment_value;
    document.getElementById('modal-editar-objetivo').style.display = 'flex';
};

window.guardarEdicion = async () => {
    const id = document.getElementById('edit-obj-id').value;
    const titulo = document.getElementById('edit-obj-titulo').value;
    const cat = document.getElementById('edit-obj-category').value || 'General';
    const desc = document.getElementById('edit-obj-desc').value;
    const type = document.getElementById('edit-obj-type').value;
    const isInverse = document.getElementById('edit-obj-inverse').checked;
    
    let target = document.getElementById('edit-obj-target').value;
    if (target === '') target = 100;

    let commit = document.getElementById('edit-obj-commit').value;
    if (commit === '') commit = 0;

    if(!titulo) return alert("El título es obligatorio");
    const btn = document.querySelector('#modal-editar-objetivo button[onclick*="guardar"]');
    btn.disabled = true; btn.innerText = "Guardando...";
    
    const { error } = await sb.from('objectives').update({
        title: titulo, category: cat, description: desc,
        target_value: target, commitment_value: commit, unit_type: type,
        is_inverse: isInverse
    }).eq('id', id);
    
    btn.disabled = false; btn.innerText = "Guardar Cambios";
    if(error) alert("Error al editar: " + error.message);
    else { document.getElementById('modal-editar-objetivo').style.display = 'none'; window.cargarVistaObjetivos(); }
};

window.guardarAvance = async () => {
    const id = document.getElementById('avance-obj-id').value;
    
    // 1. Recolectar Números (Avance)
    const inputsNum = document.querySelectorAll('.inp-mes-avance');
    const newData = {};
    inputsNum.forEach(inp => {
        if(inp.value !== '') newData[inp.getAttribute('data-mes')] = parseFloat(inp.value);
    });

    // 2. Recolectar Comentarios
    const inputsText = document.querySelectorAll('.inp-mes-comentario');
    const newComments = {};
    inputsText.forEach(inp => {
        if(inp.value.trim() !== '') newComments[inp.getAttribute('data-mes')] = inp.value.trim();
    });

    // 3. Recolectar Metas Específicas
    const inputsTarget = document.querySelectorAll('.inp-mes-target');
    const newTargets = {};
    inputsTarget.forEach(inp => {
        if(inp.value !== '') newTargets[inp.getAttribute('data-mes')] = parseFloat(inp.value);
    });

    // 4. Recolectar Compromisos Específicos
    const inputsCommit = document.querySelectorAll('.inp-mes-commit');
    const newCommits = {};
    inputsCommit.forEach(inp => {
        if(inp.value !== '') newCommits[inp.getAttribute('data-mes')] = parseFloat(inp.value);
    });
    
    const btn = document.querySelector('#modal-update-avance button[onclick*="guardar"]');
    btn.disabled = true; btn.innerText = "Guardando...";

    // 5. Guardar en Supabase (Todos los campos)
    const { error } = await sb.from('objectives').update({
        progress_data: newData,
        comments_data: newComments,
        targets_data: newTargets,
        commitments_data: newCommits
    }).eq('id', id);
    
    btn.disabled = false; btn.innerText = "Guardar Cambios";
    if(error) alert("Error: " + error.message);
    else { document.getElementById('modal-update-avance').style.display = 'none'; window.cargarVistaObjetivos(); }
};

// --- FIX NAVEGACIÓN ---
const originalMostrarDashboard = window.mostrarDashboard;
window.mostrarDashboard = async (user) => {
    const objContainer = document.getElementById('container-objetivos');
    if (objContainer) objContainer.style.display = 'none';
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.style.display = '';
        if(btnLogout.parentElement) btnLogout.parentElement.style.display = '';
    }
    if (originalMostrarDashboard) await originalMostrarDashboard(user);
};
