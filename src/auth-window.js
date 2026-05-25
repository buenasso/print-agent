/**
 * auth-window.js
 * Janela de login e seleção de loja.
 *
 * Abre uma BrowserWindow com o fluxo:
 *   1. Login (email + senha) → Firebase Auth
 *   2. Seleção de loja → salva no electron-store e dispara onSuccess
 *
 * Se skipLogin=true, pula direto para a seleção de loja
 * (usado em "Trocar loja" quando já há sessão ativa).
 */

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { signIn, fetchUserStores, getAuthInstance } = require('./firebase');
const appState = require('./app-state');

let _win = null;

/**
 * @param {object} opts
 * @param {boolean}   opts.skipLogin  — pula o formulário de login
 * @param {Function}  opts.onSuccess  — chamado com o objeto de loja selecionado
 * @param {Function}  [opts.onCancel] — chamado se o usuário fechar sem selecionar
 */
function open({ skipLogin = false, onSuccess, onCancel } = {}) {
    if (_win && !_win.isDestroyed()) {
        _win.focus();
        return;
    }

    _win = new BrowserWindow({
        width:           420,
        height:          520,
        resizable:       false,
        center:          true,
        title:           'OF Print Agent',
        show:            false,
        backgroundColor: '#f0f0f2',
        webPreferences: {
            preload:          path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
    });

    _win.loadFile(path.join(__dirname, 'ui', 'auth.html'));
    _win.setMenuBarVisibility(false);
    _win.once('ready-to-show', () => _win?.show());

    _win.webContents.once('did-finish-load', async () => {
        if (skipLogin) {
            try {
                const user   = getAuthInstance().currentUser;
                const stores = await fetchUserStores(user.uid);
                _win?.webContents.send('auth:init', { step: 'stores', stores });
            } catch {
                _win?.webContents.send('auth:init', { step: 'login' });
            }
        } else {
            _win?.webContents.send('auth:init', { step: 'login' });
        }
    });

    // ── IPC handlers ────────────────────────────────────────────────────────
    ipcMain.removeHandler('auth:login');
    ipcMain.removeHandler('auth:selectStore');
    ipcMain.removeAllListeners('auth:cancel');

    ipcMain.handle('auth:login', async (_, { email, password }) => {
        try {
            const user   = await signIn(email, password);
            const stores = await fetchUserStores(user.uid);
            if (!stores.length) throw new Error('Nenhuma loja disponível para este usuário');
            appState.saveCredentials(email, password);
            return { ok: true, stores };
        } catch (err) {
            return { ok: false, error: _friendlyError(err.message) };
        }
    });

    ipcMain.handle('auth:selectStore', async (_, store) => {
        appState.saveSelectedStore(store);
        const selected = { ...store };
        _close();
        onSuccess?.(selected);
        return { ok: true };
    });

    ipcMain.on('auth:cancel', () => {
        _close();
        onCancel?.();
    });

    _win.on('closed', () => {
        _win = null;
    });
}

function _close() {
    if (_win && !_win.isDestroyed()) _win.close();
    _win = null;
}

function _friendlyError(msg) {
    if (/invalid-credential|wrong-password|user-not-found|INVALID_LOGIN_CREDENTIALS/i.test(msg)) {
        return 'Email ou senha incorretos.';
    }
    if (/too-many-requests/i.test(msg)) {
        return 'Muitas tentativas. Aguarde alguns minutos.';
    }
    if (/network|fetch/i.test(msg)) {
        return 'Sem conexão. Verifique a internet e tente novamente.';
    }
    return msg;
}

module.exports = { open };
