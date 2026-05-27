/**
 * daemon.js
 * Loop principal do Print Agent Linux.
 *
 * Responsabilidades:
 * - Restaurar sessão Firebase via refresh token
 * - Iniciar o queue listener e o servidor Express
 * - Monitorar saúde do listener e reconectar em caso de falha
 * - Graceful shutdown em SIGTERM/SIGINT
 */

const { restoreSession, publishPrinters, watchPrintersRefresh } = require('./firebase');
const queueListener        = require('./queue-listener');
const { startServer }      = require('./server');
const { closeBrowser }     = require('./renderer');
const { listPrinters }     = require('./printers');
const state                = require('./state');
const logger               = require('./logger');
const { VERSION }          = require('./config');

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 min
const RECONNECT_TIMEOUT     = 5 * 60 * 1000; // reinicia listener após 5min inativo

let _lastActivity    = Date.now();
let _healthTimer     = null;
let _server          = null;

function notifyActivity() {
    _lastActivity = Date.now();
}

async function start() {
    logger.info(`[Daemon] OF Print Agent v${VERSION} iniciando...`);

    if (!state.isReady()) {
        logger.error('[Daemon] Agente não configurado. Rode: print-agent login');
        process.exit(1);
    }

    const { refreshToken, uid, email } = state.getAuth();
    const { groupId, storeId, storeName } = state.getStore();

    logger.info(`[Daemon] Usuário: ${email}`);
    logger.info(`[Daemon] Loja: ${storeName} (${storeId})`);

    // Restaura sessão Firebase
    try {
        await restoreSession(refreshToken);
        logger.info('[Daemon] Sessão Firebase restaurada.');
    } catch (err) {
        logger.error(`[Daemon] Falha ao restaurar sessão: ${err.message}`);
        logger.error('[Daemon] Execute "print-agent login" para reautenticar.');
        process.exit(1);
    }

    // Inicia servidor REST
    try {
        _server = await startServer();
    } catch (err) {
        logger.error(`[Daemon] Falha ao iniciar servidor: ${err.message}`);
        process.exit(1);
    }

    // Inicia listener da fila
    queueListener.start(groupId, storeId);

    // Publica impressoras locais no Firestore e monitora pedidos de refresh
    async function _syncPrinters() {
        try {
            const printers = await listPrinters();
            await publishPrinters(groupId, storeId, printers);
            logger.info(`[Daemon] Impressoras publicadas: ${printers.map(p => p.name).join(', ') || '(nenhuma)'}`);
        } catch (err) {
            logger.error(`[Daemon] Erro ao publicar impressoras: ${err.message}`);
        }
    }

    await _syncPrinters();
    watchPrintersRefresh(groupId, storeId, () => {
        logger.info('[Daemon] Refresh de impressoras solicitado pelo SaaS');
        _syncPrinters();
    });

    // Health check — reinicia listener se ficar inativo
    _healthTimer = setInterval(() => {
        if (!queueListener.isActive()) {
            logger.warn('[Daemon] Listener inativo — reiniciando...');
            queueListener.start(groupId, storeId);
        }

        const silentFor = Date.now() - _lastActivity;
        if (silentFor > RECONNECT_TIMEOUT) {
            logger.info('[Daemon] Health check — reconectando listener...');
            queueListener.stop();
            queueListener.start(groupId, storeId);
            _lastActivity = Date.now();
        }
    }, HEALTH_CHECK_INTERVAL);

    logger.info('[Daemon] Pronto. Aguardando jobs de impressão...');
}

async function shutdown(signal) {
    logger.info(`[Daemon] Recebido ${signal} — encerrando...`);

    clearInterval(_healthTimer);
    queueListener.stop();

    await closeBrowser();

    if (_server) {
        await new Promise(resolve => _server.close(resolve));
    }

    logger.info('[Daemon] Encerrado com sucesso.');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    logger.error(`[Daemon] Erro não capturado: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
    logger.error(`[Daemon] Promise rejeitada: ${reason}`);
});

module.exports = { start, notifyActivity };

// Inicia se for o módulo principal
if (require.main === module) {
    start();
}
