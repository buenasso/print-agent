/**
 * printers.js — Linux (CUPS)
 *
 * Listar:  lpstat -a + lpoptions (igual ao macOS — CUPS é o mesmo)
 * RAW:     lp -d printer -o raw tmpfile
 * PDF:     lp -d printer tmpfile
 * HTML:    delegado ao renderer.js (Puppeteer → PDF → lp)
 */

const { exec }  = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const { DEFAULT_ENCODING, PRINT_TIMEOUT } = require('./config');
const logger    = require('./logger');

function execAsync(cmd, options = {}) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: PRINT_TIMEOUT, ...options }, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve({ stdout, stderr });
        });
    });
}

function shellEscape(str) {
    return str.replace(/'/g, "'\\''");
}

// ── Listar impressoras ────────────────────────────────────────────────────────

async function listPrinters() {
    try {
        return await _listPrintersLinux();
    } catch (err) {
        logger.error(`[Printers] Erro ao listar: ${err.message}`);
        return [];
    }
}

async function _listPrintersLinux() {
    let stdout;
    try {
        ({ stdout } = await execAsync('lpstat -a', { timeout: 5000 }));
    } catch {
        // CUPS não instalado ou sem impressoras
        return [];
    }

    if (!stdout.trim()) return [];

    const queueNames = stdout.trim().split('\n')
        .map(line => line.split(/\s+/)[0])
        .filter(Boolean);

    return Promise.all(
        queueNames.map(async (queueName) => {
            const displayName = await _getDisplayName(queueName);
            return { name: queueName, displayName: displayName || queueName };
        })
    );
}

async function _getDisplayName(queueName) {
    try {
        const safe = shellEscape(queueName);
        const { stdout } = await execAsync(`lpoptions -p '${safe}'`, { timeout: 3000 });
        const match = stdout.match(/printer-info='([^']*)'/) ||
                      stdout.match(/printer-info=(\S+)/);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}

// ── RAW (ESC/POS) ─────────────────────────────────────────────────────────────

async function printRaw(printerName, data, encoding = DEFAULT_ENCODING) {
    const rawString = data.join('');
    const buffer    = Buffer.from(rawString, encoding);
    const tmpFile   = path.join(os.tmpdir(), `print-agent-${Date.now()}.raw`);

    fs.writeFileSync(tmpFile, buffer);

    try {
        const safe = shellEscape(printerName);
        await execAsync(`lp -d '${safe}' -o raw '${tmpFile}'`);
        logger.info(`[Printers] RAW enviado para: ${printerName}`);
        return true;
    } catch (err) {
        logger.error(`[Printers] Erro RAW print: ${err.message}`);
        return false;
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
}

// ── PDF ───────────────────────────────────────────────────────────────────────

async function printPdf(printerName, base64Data, options = {}) {
    const tmpFile = path.join(os.tmpdir(), `print-agent-${Date.now()}.pdf`);

    try {
        fs.writeFileSync(tmpFile, Buffer.from(base64Data, 'base64'));

        const safe  = shellEscape(printerName);
        let   flags = `-d '${safe}'`;
        if (options.copies && options.copies > 1) {
            flags += ` -n ${parseInt(options.copies, 10)}`;
        }

        await execAsync(`lp ${flags} '${tmpFile}'`);
        logger.info(`[Printers] PDF enviado para: ${printerName}`);
        return true;
    } catch (err) {
        logger.error(`[Printers] Erro PDF print: ${err.message}`);
        return false;
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
}

// ── HTML / Label (via Puppeteer) ──────────────────────────────────────────────

async function printHtml(printerName, html, widthMm, heightMm) {
    const { renderHtmlToPdf } = require('./renderer');
    const tmpFile = path.join(os.tmpdir(), `print-agent-label-${Date.now()}.pdf`);

    try {
        await renderHtmlToPdf(html, widthMm, heightMm, tmpFile);

        const safe = shellEscape(printerName);
        await execAsync(`lp -d '${safe}' '${tmpFile}'`);
        logger.info(`[Printers] Label enviada para: ${printerName}`);
        return true;
    } catch (err) {
        logger.error(`[Printers] Erro HTML print: ${err.message}`);
        return false;
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
}

module.exports = { listPrinters, printRaw, printPdf, printHtml };
