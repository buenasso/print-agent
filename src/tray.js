/**
 * tray.js
 * Ícone na bandeja do sistema (System Tray)
 *
 * Mostra um ícone discreto no tray com:
 * - Indicador visual de status (tooltip)
 * - Menu de contexto (clique direito):
 *   · Status do agente (informativo)
 *   · Abrir diagnóstico no navegador
 *   · Encerrar
 *
 * ── SEM JANELA ────────────────────────────────────────────
 * O agente não abre nenhuma janela. Roda exclusivamente
 * na bandeja do sistema — o usuário só vê o ícone.
 * ──────────────────────────────────────────────────────────
 */

const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { PORT, VERSION } = require('./config');

let tray = null;

// ============================================
// ÍCONE
// ============================================

/**
 * Carrega o ícone correto para o tray.
 *
 * ── TAMANHOS ──────────────────────────────────────────────
 * macOS: tray icon deve ser 22x22 (ou 44x44 @2x Retina).
 *        Usa trayTemplate.png / trayTemplate@2x.png.
 *        O sufixo "Template" faz o macOS adaptar ao tema.
 * Windows: usa icon.ico (pode ser multi-resolução).
 *
 * Os arquivos grandes (icon.png 512x512+) são usados apenas
 * pelo electron-builder pro ícone do app/instalador.
 * ──────────────────────────────────────────────────────────
 */
function loadIcon() {
    const isWin  = process.platform === 'win32';
    const isMac  = process.platform === 'darwin';

    // macOS: usa o ícone Template (adapta a tema claro/escuro)
    // O Electron carrega automaticamente o @2x se existir
    const iconFile = isMac ? 'trayTemplate.png' : 'icon.ico';
    const iconPath = path.join(__dirname, '..', 'assets', iconFile);

    try {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
            if (isMac) icon.setTemplateImage(true);
            return icon;
        }
    } catch (_) {}

    // Fallback: gera ícone placeholder em memória (22x22)
    console.warn('[Tray] Ícone não encontrado em', iconPath, '— usando placeholder');
    return createPlaceholderIcon();
}

/**
 * Gera um ícone placeholder 22x22 usando nativeImage.
 * É um círculo cinza — serve pra dev/testes.
 */
function createPlaceholderIcon() {
    const size = 22;
    const canvas = Buffer.alloc(size * size * 4); // RGBA

    for (let i = 0; i < size * size; i++) {
        const offset = i * 4;
        canvas[offset]     = 100;  // R
        canvas[offset + 1] = 100;  // G
        canvas[offset + 2] = 100;  // B
        canvas[offset + 3] = 255;  // A
    }

    const icon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    return icon;
}

// ============================================
// MENU DE CONTEXTO
// ============================================

/**
 * Constrói o menu de contexto do tray.
 * @param {boolean} serverOnline — se o servidor Express está rodando
 */
function buildMenu(serverOnline) {
    const statusLabel = serverOnline ? '● Online' : '○ Offline';
    const statusIcon  = serverOnline ? '🟢' : '🔴';

    return Menu.buildFromTemplate([
        {
            label:   `Print Agent v${VERSION}`,
            enabled: false,
        },
        {
            label:   `Status: ${statusLabel}`,
            enabled: false,
        },
        { type: 'separator' },
        {
            label: 'Verificar status no navegador',
            click: () => {
                shell.openExternal(`http://127.0.0.1:${PORT}/status`);
            },
        },
        { type: 'separator' },
        {
            label: 'Encerrar',
            click: () => {
                if (tray) tray.destroy();
                process.exit(0);
            },
        },
    ]);
}

// ============================================
// API PÚBLICA
// ============================================

/**
 * Inicializa o ícone na bandeja do sistema.
 * Deve ser chamado após app.whenReady() do Electron.
 *
 * @param {boolean} [serverOnline=false] — status inicial do servidor
 * @returns {Tray} — instância do tray
 */
function createTray(serverOnline = false) {
    const icon = loadIcon();
    tray = new Tray(icon);

    tray.setToolTip(`Print Agent v${VERSION} — ${serverOnline ? 'Online' : 'Offline'}`);
    tray.setContextMenu(buildMenu(serverOnline));

    console.log('[Tray] Ícone criado na bandeja do sistema');
    return tray;
}

/**
 * Atualiza o status exibido no tray (tooltip + menu).
 * Chamado quando o servidor Express inicia ou para.
 *
 * @param {boolean} serverOnline
 */
function updateTrayStatus(serverOnline) {
    if (!tray || tray.isDestroyed()) return;

    tray.setToolTip(`Print Agent v${VERSION} — ${serverOnline ? 'Online' : 'Offline'}`);
    tray.setContextMenu(buildMenu(serverOnline));
}

module.exports = {
    createTray,
    updateTrayStatus,
};
