/**
 * renderer.js
 * Renderização de HTML para PDF via Puppeteer headless.
 *
 * O browser é iniciado uma vez e mantido em memória (singleton).
 * Cada label abre uma nova aba — sem overhead de inicialização por job.
 * Funciona em servidores headless sem display (sem xvfb necessário).
 */

const puppeteer       = require('puppeteer-core');
const { CHROMIUM_PATH } = require('./config');
const logger          = require('./logger');

let _browser = null;

async function _getBrowser() {
    if (_browser && _browser.connected) return _browser;

    logger.info('[Renderer] Iniciando Chromium headless...');
    _browser = await puppeteer.launch({
        executablePath: CHROMIUM_PATH,
        headless:       true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    _browser.on('disconnected', () => {
        logger.warn('[Renderer] Chromium desconectado — será reiniciado no próximo job');
        _browser = null;
    });

    logger.info('[Renderer] Chromium pronto.');
    return _browser;
}

/**
 * Renderiza HTML em PDF com as dimensões exatas da etiqueta.
 *
 * @param {string} html      — HTML completo da etiqueta
 * @param {number} widthMm   — largura em mm
 * @param {number} heightMm  — altura em mm
 * @param {string} outPath   — caminho do arquivo PDF de saída
 */
async function renderHtmlToPdf(html, widthMm, heightMm, outPath) {
    const browser = await _getBrowser();
    const page    = await browser.newPage();

    try {
        // Define viewport exato da etiqueta
        await page.setViewport({
            width:  Math.round(widthMm  * 3.7795), // mm → px a 96dpi
            height: Math.round(heightMm * 3.7795),
            deviceScaleFactor: 2,
        });

        await page.setContent(html, { waitUntil: 'networkidle0' });

        await page.pdf({
            path:               outPath,
            width:              `${widthMm}mm`,
            height:             `${heightMm}mm`,
            printBackground:    true,
            margin:             { top: 0, right: 0, bottom: 0, left: 0 },
        });

        logger.info(`[Renderer] PDF gerado: ${outPath} (${widthMm}x${heightMm}mm)`);
    } finally {
        await page.close();
    }
}

/**
 * Encerra o browser (chamado no graceful shutdown do daemon).
 */
async function closeBrowser() {
    if (_browser) {
        await _browser.close().catch(() => {});
        _browser = null;
        logger.info('[Renderer] Chromium encerrado.');
    }
}

module.exports = { renderHtmlToPdf, closeBrowser };
