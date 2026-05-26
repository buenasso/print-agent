/**
 * queue-listener.js
 * Escuta groups/{groupId}/stores/{storeId}/print_queue onde status='pending',
 * faz claim atômico via transação e executa o job de impressão.
 *
 * Lógica idêntica à versão Electron — sem dependência do Electron.
 */

const {
    collection, query, where, orderBy,
    onSnapshot, runTransaction, serverTimestamp, updateDoc,
} = require('firebase/firestore');

const { getFirestoreInstance } = require('./firebase');
const { listPrinters, printRaw, printPdf, printHtml } = require('./printers');
const logger = require('./logger');
const { PRINTERS_TTL } = require('./config');

let _unsubscribe      = null;
let _groupId          = null;
let _storeId          = null;
let _localPrinters    = null;
let _printersLoadedAt = 0;

function start(groupId, storeId) {
    stop();
    _groupId          = groupId;
    _storeId          = storeId;
    _localPrinters    = null;
    _printersLoadedAt = 0;

    const db = getFirestoreInstance();
    const q  = query(
        collection(db, 'groups', groupId, 'stores', storeId, 'print_queue'),
        where('status', '==', 'pending'),
        orderBy('created_at'),
    );

    _unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') _processJob(change.doc);
            });
        },
        (err) => logger.error(`[Queue] Erro no listener: ${err.message}`),
    );

    logger.info(`[Queue] Escutando jobs para ${groupId}/${storeId}`);
}

function stop() {
    if (_unsubscribe) {
        _unsubscribe();
        _unsubscribe      = null;
        _groupId          = null;
        _storeId          = null;
        _localPrinters    = null;
        _printersLoadedAt = 0;
        logger.info('[Queue] Listener parado');
    }
}

function isActive() {
    return _unsubscribe !== null;
}

async function _getLocalPrinters() {
    const now = Date.now();
    if (_localPrinters !== null && (now - _printersLoadedAt) < PRINTERS_TTL) {
        return _localPrinters;
    }
    try {
        const list        = await listPrinters();
        _localPrinters    = new Set(list.map(p => p.name));
        _printersLoadedAt = now;
        logger.info(`[Queue] Impressoras neste PC: ${[..._localPrinters].join(', ') || '(nenhuma)'}`);
    } catch {
        _localPrinters    = new Set();
        _printersLoadedAt = now;
    }
    return _localPrinters;
}

async function _processJob(jobDoc) {
    const job = jobDoc.data();

    const localPrinters = await _getLocalPrinters();
    if (job.printer_name && !localPrinters.has(job.printer_name)) {
        logger.info(`[Queue] Impressora "${job.printer_name}" não disponível neste PC — aguardando outro PC`);
        return;
    }

    const db     = getFirestoreInstance();
    const jobRef = jobDoc.ref;

    try {
        await runTransaction(db, async (tx) => {
            const fresh = await tx.get(jobRef);
            if (fresh.data().status !== 'pending') throw new Error('already_claimed');
            tx.update(jobRef, {
                status:        'processing',
                processing_at: serverTimestamp(),
            });
        });
    } catch (err) {
        if (err.message !== 'already_claimed') {
            logger.error(`[Queue] Erro ao assumir job: ${err.message}`);
        }
        return;
    }

    logger.info(`[Queue] Processando job "${job.label}" → ${job.printer_alias}`);

    try {
        let success = false;

        if (job.type === 'pdf') {
            success = await printPdf(job.printer_name, job.data);

        } else if (job.type === 'label') {
            if (job.html) {
                success = await printHtml(
                    job.printer_name,
                    job.html,
                    job.width_mm  || 100,
                    job.height_mm || 50,
                );
            } else {
                throw new Error(
                    'Job de etiqueta requer o campo "html" pré-renderizado. ' +
                    'Atualize o SaaS para incluir html/width_mm/height_mm ao gravar jobs de label na fila.'
                );
            }

        } else {
            success = await printRaw(job.printer_name, [job.data], 'base64');
        }

        if (success) {
            await updateDoc(jobRef, {
                status:       'done',
                processed_at: serverTimestamp(),
            });
            logger.info(`[Queue] Job concluído: ${job.label}`);
        } else {
            await _fail(jobRef, 'Print Agent retornou falha');
        }

    } catch (err) {
        await _fail(jobRef, err.message);
    }
}

async function _fail(jobRef, errorMessage) {
    logger.error(`[Queue] Job falhou: ${errorMessage}`);
    try {
        await updateDoc(jobRef, {
            status:       'failed',
            error:        errorMessage,
            processed_at: serverTimestamp(),
        });
    } catch (e) {
        logger.error(`[Queue] Erro ao registrar falha: ${e.message}`);
    }
}

module.exports = { start, stop, isActive };
