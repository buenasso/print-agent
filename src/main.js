/**
 * main.js
 * Entry point do Print Agent (processo principal do Electron)
 *
 * Responsabilidades:
 * - Iniciar o app Electron SEM janela (tray-only)
 * - Criar o ícone na bandeja do sistema
 * - Iniciar o servidor Express (API REST local para o SaaS)
 * - Conectar ao Firebase com credenciais do usuário
 * - Escutar a fila de impressão do Firestore diretamente
 * - Garantir instância única
 * - Auto-start com o sistema
 */

const { app } = require('electron');
const { startServer }                           = require('./server');
const { createTray, updateTrayStatus,
        updateTrayAuth }                         = require('./tray');
const { listPrinters }                          = require('./printers');
const { signIn, signOut }                       = require('./firebase');
const appState                                  = require('./app-state');
const { open: openAuthWindow }                  = require('./auth-window');
const queueListener                             = require('./queue-listener');
const { VERSION }                               = require('./config');

// ============================================
// INSTÂNCIA ÚNICA
// ============================================

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    console.log('[PrintAgent] Outra instância já está rodando. Encerrando.');
    app.quit();
}

// ============================================
// CONFIGURAÇÃO DO ELECTRON
// ============================================

if (process.platform === 'darwin') {
    app.dock?.hide();
}

app.disableHardwareAcceleration();

// ============================================
// AUTO-START COM O SISTEMA
// ============================================

if (app.isPackaged) {
    app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        args: ['--hidden'],
    });
}

// ============================================
// BOOT
// ============================================

app.whenReady().then(async () => {
    console.log('');
    console.log('  +========================================+');
    console.log('  |     Print Agent v' + VERSION + '              |');
    console.log('  |   Agente local de impressao ativo      |');
    console.log('  +========================================+');
    console.log('');

    // 1. Cria o tray com callbacks para ações do menu
    createTray(false, {
        onLogin:       () => _startAuthFlow(),
        onChangeStore: () => _startChangeStore(),
        onSignOut:     () => _doSignOut(),
    });

    // 2. Inicia o servidor Express (API local para o SaaS)
    try {
        await startServer();
        updateTrayStatus(true);

        const printers = await listPrinters();
        console.log(`[PrintAgent] ${printers.length} impressora(s) encontrada(s):`);
        printers.forEach((p, i) => console.log(`  ${i + 1}. ${p.displayName || p.name}`));
        console.log('');

    } catch (err) {
        console.error('[PrintAgent] Falha ao iniciar servidor:', err.message);
        updateTrayStatus(false);
    }

    // 3. Tenta login automático ou abre a janela de autenticação
    if (appState.isReady()) {
        _tryAutoLogin();
    } else {
        _startAuthFlow();
    }
});

// ============================================
// AUTH FLOW
// ============================================

async function _tryAutoLogin() {
    const { email, password } = appState.getCredentials();
    const store               = appState.getSelectedStore();

    try {
        await signIn(email, password);
        queueListener.start(store.groupId, store.storeId);
        updateTrayAuth(store);
        console.log(`[PrintAgent] Auto-login OK — escutando "${store.storeName}"`);
    } catch (err) {
        console.warn('[PrintAgent] Auto-login falhou:', err.message);
        appState.clear();
        _startAuthFlow();
    }
}

function _startAuthFlow() {
    openAuthWindow({
        skipLogin: false,
        onSuccess: (store) => {
            queueListener.start(store.groupId, store.storeId);
            updateTrayAuth(store);
            console.log(`[PrintAgent] Conectado — escutando "${store.storeName}" (${store.groupName})`);
        },
    });
}

function _startChangeStore() {
    queueListener.stop();
    openAuthWindow({
        skipLogin: true,
        onSuccess: (store) => {
            queueListener.start(store.groupId, store.storeId);
            updateTrayAuth(store);
            console.log(`[PrintAgent] Loja alterada — escutando "${store.storeName}"`);
        },
        onCancel: () => {
            // Restaura o listener com a loja anterior, se houver
            const saved = appState.getSelectedStore();
            if (saved.storeId) {
                queueListener.start(saved.groupId, saved.storeId);
                updateTrayAuth(saved);
            }
        },
    });
}

async function _doSignOut() {
    queueListener.stop();
    appState.clear();
    await signOut();
    updateTrayAuth(null);
    console.log('[PrintAgent] Sessão encerrada');
    _startAuthFlow();
}

// ============================================
// LIFECYCLE
// ============================================

app.on('window-all-closed', (e) => {
    e.preventDefault();
});

app.on('before-quit', () => {
    console.log('[PrintAgent] Encerrando...');
    queueListener.stop();
});
