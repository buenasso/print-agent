/**
 * server.js
 * API REST do Print Agent
 *
 * Endpoints:
 *   GET  /status     → health check + versão
 *   GET  /printers   → lista impressoras instaladas no Windows
 *   POST /print/raw  → imprime dados RAW/ESC-POS
 *   POST /print/pdf  → imprime arquivo PDF (base64)
 *
 * Segurança:
 *   - Escuta SOMENTE em localhost (127.0.0.1)
 *   - CORS restrito aos domínios do SaaS (config.js)
 *   - Nenhuma porta exposta na rede
 */

const express = require('express');
const cors    = require('cors');
const { PORT, ALLOWED_ORIGINS, VERSION } = require('./config');
const { listPrinters, printRaw, printPdf } = require('./printers');

const app = express();

// ============================================
// MIDDLEWARES
// ============================================

// CORS — só permite origens do SaaS
app.use(cors({
    origin: (origin, callback) => {
        // Permite requests sem origin (ex: curl, Postman em dev)
        if (!origin) return callback(null, true);

        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            console.warn('[Server] Origem bloqueada pelo CORS:', origin);
            callback(new Error('Origem não permitida'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Parse JSON com limite de 50MB (PDFs grandes)
app.use(express.json({ limit: '50mb' }));

// ============================================
// ROTAS
// ============================================

/**
 * GET /status
 * Health check — o SaaS usa para verificar se o agente está rodando.
 * Retorna versão e status.
 */
app.get('/status', (req, res) => {
    res.json({
        status:  'online',
        version: VERSION,
        agent:   'PrintAgent',
    });
});

/**
 * GET /printers
 * Lista todas as impressoras instaladas no Windows.
 * O SaaS usa para popular o select de impressoras na tela de config.
 */
app.get('/printers', async (req, res) => {
    try {
        const printers = await listPrinters();
        res.json({ printers });
    } catch (err) {
        console.error('[Server] Erro ao listar impressoras:', err);
        res.status(500).json({ error: 'Falha ao listar impressoras' });
    }
});

/**
 * POST /print/raw
 * Envia dados RAW (ESC/POS) diretamente para a impressora.
 *
 * Body esperado:
 * {
 *   "printer":  "EPSON TM-T20",       ← nome da impressora no Windows
 *   "data":     ["\x1B\x40", "Texto"] ← array de strings com comandos ESC/POS
 *   "encoding": "latin1"              ← opcional (padrão: latin1 / ISO-8859-1)
 * }
 *
 * ── COMPATIBILIDADE COM qztray.js ─────────────────────────
 * O formato do array `data` é idêntico ao que o qztray.js
 * já envia — cada item é uma string com comandos ESC/POS.
 * ──────────────────────────────────────────────────────────
 */
app.post('/print/raw', async (req, res) => {
    const { printer, data, encoding } = req.body;

    // Validação
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
        console.error('[Server] Erro em /print/raw:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /print/pdf
 * Imprime um arquivo PDF na impressora especificada.
 *
 * Body esperado:
 * {
 *   "printer": "HP LaserJet Pro",  ← nome da impressora
 *   "file":    "JVBERi0xLjQ...",   ← PDF em base64
 *   "options": { "copies": 1 }     ← opcional
 * }
 */
app.post('/print/pdf', async (req, res) => {
    const { printer, file, options } = req.body;

    // Validação
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
        console.error('[Server] Erro em /print/pdf:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// INICIALIZAÇÃO
// ============================================

/**
 * Inicia o servidor escutando SOMENTE em 127.0.0.1
 * — nunca expõe na rede local/externa.
 */
function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, '127.0.0.1', () => {
            console.log(`[PrintAgent] Rodando em http://127.0.0.1:${PORT}`);
            console.log(`[PrintAgent] Versão ${VERSION}`);
            resolve(server);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`[PrintAgent] Porta ${PORT} já está em uso!`);
                console.error('[PrintAgent] Outra instância pode estar rodando.');
            }
            reject(err);
        });
    });
}

module.exports = { startServer };
