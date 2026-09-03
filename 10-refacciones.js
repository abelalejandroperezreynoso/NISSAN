// ==========================================
// 10-refacciones.js (VERSIÓN REDUCIDA - ENLACE A PÁGINA INDEPENDIENTE)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // Inyectar el botón en el menú principal del Dashboard
    const btnStatsEncuestas = document.getElementById('btn-ver-stats-encuestas');
    
    if (btnStatsEncuestas) {
        // Nota como el onclick ahora usa window.location.href para ir a la nueva página
        const btnRefaccionesHTML = `
            <div class="ios-app-btn" id="btn-solicitar-refacciones" onclick="window.irAPantalla('10-refacciones.html')">
                <div class="ios-app-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 4px 10px rgba(245, 158, 11, 0.4); border: none;">⚙️</div>
                <div class="ios-app-label">Refacciones</div>
            </div>
        `;
        btnStatsEncuestas.insertAdjacentHTML('afterend', btnRefaccionesHTML);
    }
});
