/**
 * tray.js
 * Ícone na bandeja do sistema (System Tray)
 *
 * Estado exposto no menu:
 * - Status do servidor (online/offline)
 * - Conta conectada e loja ativa
 * - Ações: Trocar loja, Sair da conta, Verificar status, Encerrar
 */

const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { PORT, VERSION } = require('./config');

let tray         = null;
let _online      = false;
let _authState   = null;  // { storeName, groupName, email } | null
let _callbacks   = {};

// ============================================
// ÍCONE
// ============================================

function loadIcon() {
    const isMac  = process.platform === 'darwin';
    const iconFile = isMac ? 'trayTemplate.png' : 'icon.ico';
    const iconPath = path.join(__dirname, '..', 'assets', iconFile);

    try {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
            if (isMac) icon.setTemplateImage(true);
            return icon;
        }
    } catch (_) {}

    console.warn('[Tray] Ícone não encontrado em', iconPath, '— usando placeholder');
    return createPlaceholderIcon();
}

function createPlaceholderIcon() {
    const size   = 22;
    const canvas = Buffer.alloc(size * size * 4);

    for (let i = 0; i < size * size; i++) {
        const offset = i * 4;
        canvas[offset]     = 100;
        canvas[offset + 1] = 100;
        canvas[offset + 2] = 100;
        canvas[offset + 3] = 255;
    }

    const icon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    return icon;
}

// ============================================
// MENU DE CONTEXTO
// ============================================

function buildMenu() {
    const statusLabel = _online ? '● Online' : '○ Offline';
    const items = [];

    items.push({ label: `Print Agent v${VERSION}`, enabled: false });
    items.push({ label: `Status: ${statusLabel}`,  enabled: false });
    items.push({ type:  'separator' });

    if (_authState) {
        items.push({ label: `Loja: ${_authState.storeName}`, enabled: false });
        items.push({ label: _authState.groupName,             enabled: false });
        items.push({ type:  'separator' });
        items.push({ label: 'Trocar loja',    click: () => _callbacks.onChangeStore?.() });
        items.push({ label: 'Sair da conta',  click: () => _callbacks.onSignOut?.()    });
    } else {
        items.push({ label: 'Sem conta vinculada', enabled: false });
        items.push({ label: 'Fazer login...',  click: () => _callbacks.onLogin?.() });
    }

    items.push({ type: 'separator' });
    items.push({
        label: 'Verificar status no navegador',
        click: () => shell.openExternal(`http://127.0.0.1:${PORT}/status`),
    });
    items.push({ type: 'separator' });
    items.push({
        label: 'Encerrar',
        click: () => {
            if (tray) tray.destroy();
            process.exit(0);
        },
    });

    return Menu.buildFromTemplate(items);
}

function _refresh() {
    if (!tray || tray.isDestroyed()) return;
    const tooltip = _authState
        ? `Print Agent v${VERSION} — ${_authState.storeName}`
        : `Print Agent v${VERSION} — ${_online ? 'Online' : 'Offline'}`;
    tray.setToolTip(tooltip);
    tray.setContextMenu(buildMenu());
}

// ============================================
// API PÚBLICA
// ============================================

/**
 * @param {boolean} serverOnline
 * @param {object}  callbacks
 * @param {Function} callbacks.onLogin
 * @param {Function} callbacks.onChangeStore
 * @param {Function} callbacks.onSignOut
 */
function createTray(serverOnline = false, callbacks = {}) {
    _online    = serverOnline;
    _callbacks = callbacks;

    const icon = loadIcon();
    tray = new Tray(icon);
    _refresh();

    console.log('[Tray] Ícone criado na bandeja do sistema');
    return tray;
}

function updateTrayStatus(serverOnline) {
    _online = serverOnline;
    _refresh();
}

/** @param {{ storeName, groupName, email } | null} authState */
function updateTrayAuth(authState) {
    _authState = authState;
    _refresh();
}

module.exports = { createTray, updateTrayStatus, updateTrayAuth };
