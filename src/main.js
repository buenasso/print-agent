/**
 * main.js
 * Entry point do Print Agent (processo principal do Electron)
 *
 * Responsabilidades:
 * - Iniciar o app Electron SEM janela (tray-only)
 * - Criar o ícone na bandeja do sistema
 * - Iniciar o servidor Express (API REST)
 * - Garantir instância única (não abrir duplicado)
 * - Auto-start com o sistema (configurável no instalador)
 *
 * ── SEM JANELA ────────────────────────────────────────────
 * O Electron é usado apenas pelo tray icon nativo e pelo
 * empacotamento como .exe/.dmg. Nenhuma janela é criada.
 * ──────────────────────────────────────────────────────────
 */

const { app } = require('electron');
const { startServer } = require('./server');
const { createTray, updateTrayStatus } = require('./tray');
const { listPrinters } = require('./printers');
const { VERSION } = require('./config');

// ============================================
// INSTÂNCIA ÚNICA
// ============================================

/**
 * Garante que só uma instância do Print Agent pode rodar por vez.
 * Se o usuário tentar abrir uma segunda, a primeira recebe foco.
 */
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    console.log('[PrintAgent] Outra instância já está rodando. Encerrando.');
    app.quit();
}

// ============================================
// CONFIGURAÇÃO DO ELECTRON
// ============================================

// Não mostra o app no dock do macOS (é tray-only)
if (process.platform === 'darwin') {
    app.dock?.hide();
}

// ============================================
// AUTO-START COM O SISTEMA
// ============================================

/**
 * Registra o app para iniciar automaticamente com o sistema.
 *
 * - Windows: cria entrada no registro (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
 * - macOS: adiciona em Login Items (Preferências do Sistema > Geral > Itens de Início)
 *
 * ── NOTA ──────────────────────────────────────────────────
 * O openAtLogin só funciona corretamente no app empacotado
 * (após build). Em dev (npm start), pode não registrar.
 * O 'path' é preenchido automaticamente pelo Electron
 * com o caminho do executável atual.
 * ──────────────────────────────────────────────────────────
 */
if (app.isPackaged) {
    app.setLoginItemSettings({
        openAtLogin: true,
        // Windows: abre minimizado (sem flash de janela)
        openAsHidden: true,
        // macOS: argumentos extras (opcional)
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

    // 1. Cria o tray icon (status offline inicialmente)
    createTray(false);

    // 2. Inicia o servidor Express
    try {
        await startServer();
        updateTrayStatus(true);

        // Log informativo das impressoras
        const printers = await listPrinters();
        console.log(`[PrintAgent] ${printers.length} impressora(s) encontrada(s):`);
        printers.forEach((p, i) => console.log(`  ${i + 1}. ${p.displayName || p.name}`));
        console.log('');
        console.log('[PrintAgent] Pronto — rodando na bandeja do sistema.');

    } catch (err) {
        console.error('[PrintAgent] Falha ao iniciar servidor:', err.message);
        updateTrayStatus(false);
    }
});

// ============================================
// LIFECYCLE
// ============================================

// Impede que o app feche quando não há janelas (normal pra tray apps)
app.on('window-all-closed', (e) => {
    e.preventDefault();
});

// Graceful shutdown
app.on('before-quit', () => {
    console.log('[PrintAgent] Encerrando...');
});
