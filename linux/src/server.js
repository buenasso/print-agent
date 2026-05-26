/**
 * server.js — API REST do Print Agent Linux
 *
 * Idêntica à versão Electron, sem nenhuma dep do Electron.
 * Escuta SOMENTE em 127.0.0.1 — nunca exposta na rede.
 */

const express  = require('express');
const cors     = require('cors');
const { PORT, ALLOWED_ORIGINS, VERSION } = require('./config');
const { listPrinters, printRaw, printPdf, printHtml } = require('./printers');
const logger   = require('./logger');

const app = express();

// Private Network Access (PNA) — Chrome 104+
app.use((req, res, next) => {
    if (req.headers['access-control-request-private-network']) {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
});

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://')) {
            callback(null, true);
        } else {
            logger.warn(`[Server] Origem bloqueada pelo CORS: ${origin}`);
            callback(new Error('Origem não permitida'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '50mb' }));

app.get('/status', (req, res) => {
    res.json({ status: 'online', version: VERSION, agent: 'PrintAgent-Linux' });
});

app.get('/printers', async (req, res) => {
    try {
        const printers = await listPrinters();
        res.json({ printers });
    } catch (err) {
        logger.error(`[Server] Erro ao listar impressoras: ${err.message}`);
        res.status(500).json({ error: 'Falha ao listar impressoras' });
    }
});

app.post('/print/raw', async (req, res) => {
    const { printer, data, encoding } = req.body;

    if (!printer || typeof printer !== 'string') {
        return res.status(400).json({ error: 'Campo "printer" é obrigatório (string)' });
    }
    if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'Campo "data" é obrigatório (array de strings)' });
    }

    try {
        const ok = await printRaw(printer, data, encoding);
        if (ok) {
            res.json({ success: true, message: 'Job enviado para a impressora' });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao enviar para a impressora' });
        }
    } catch (err) {
        logger.error(`[Server] Erro em /print/raw: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/print/pdf', async (req, res) => {
    const { printer, file, options } = req.body;

    if (!printer || typeof printer !== 'string') {
        return res.status(400).json({ error: 'Campo "printer" é obrigatório (string)' });
    }
    if (!file || typeof file !== 'string') {
        return res.status(400).json({ error: 'Campo "file" é obrigatório (base64 do PDF)' });
    }

    try {
        const ok = await printPdf(printer, file, options || {});
        if (ok) {
            res.json({ success: true, message: 'PDF enviado para a impressora' });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao imprimir PDF' });
        }
    } catch (err) {
        logger.error(`[Server] Erro em /print/pdf: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/print/html', async (req, res) => {
    const { printer, html, width_mm, height_mm } = req.body;

    if (!printer || typeof printer !== 'string') {
        return res.status(400).json({ error: 'Campo "printer" é obrigatório (string)' });
    }
    if (!html || typeof html !== 'string') {
        return res.status(400).json({ error: 'Campo "html" é obrigatório (string)' });
    }

    try {
        const ok = await printHtml(printer, html, width_mm || 100, height_mm || 50);
        if (ok) {
            res.json({ success: true, message: 'Etiqueta enviada para impressão' });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao renderizar ou imprimir etiqueta' });
        }
    } catch (err) {
        logger.error(`[Server] Erro em /print/html: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, '127.0.0.1', () => {
            logger.info(`[Server] Rodando em http://127.0.0.1:${PORT}`);
            resolve(server);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`[Server] Porta ${PORT} já está em uso! Outra instância pode estar rodando.`);
            }
            reject(err);
        });
    });
}

module.exports = { startServer };
