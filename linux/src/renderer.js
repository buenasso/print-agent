/**
 * renderer.js
 * Renderização de HTML para PDF via Puppeteer headless.
 *
 * O browser é iniciado uma vez e mantido em memória (singleton).
 * Cada label abre uma nova aba — sem overhead de inicialização por job.
 * Funciona em servidores headless sem display (sem xvfb necessário).
 */

const puppeteer         = require('puppeteer-core');
const fs                = require('fs');
const { CHROMIUM_PATH } = require('./config');
const logger            = require('./logger');

let _browser     = null;
let _fontFaceCss = null;

// Lê as variantes de Liberation Sans e codifica em base64 para injetar no HTML.
// Snap Chromium não tem acesso a /usr/share/fonts/, então embute as fontes
// diretamente para garantir renderização correta independente do ambiente.
function _buildFontFaceCss() {
    if (_fontFaceCss !== null) return _fontFaceCss;

    const variants = [
        { path: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',    weight: '400', style: 'normal'  },
        { path: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',        weight: '700', style: 'normal'  },
        { path: '/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf',      weight: '400', style: 'italic'  },
        { path: '/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf',  weight: '700', style: 'italic'  },
    ];

    const faces = variants
        .filter(v => fs.existsSync(v.path))
        .map(v => {
            const b64 = fs.readFileSync(v.path).toString('base64');
            return `@font-face{font-family:'Liberation Sans';src:url('data:font/truetype;base64,${b64}');font-weight:${v.weight};font-style:${v.style};}`;
        });

    _fontFaceCss = faces.join('');
    if (faces.length > 0) {
        logger.info(`[Renderer] Liberation Sans embutida (${faces.length} variantes).`);
    } else {
        logger.warn('[Renderer] Liberation Sans NÃO encontrada em /usr/share/fonts/truetype/liberation/ — instale com: sudo apt-get install fonts-liberation');
    }
    return _fontFaceCss;
}

function _injectFonts(html) {
    const css = _buildFontFaceCss();
    if (!css) return html;
    // Force all elements to use Liberation Sans: the HTML's font-family stack
    // (-apple-system, Segoe UI, Arial…) doesn't exist on Linux, so Chromium
    // falls through to the system sans-serif and ignores the embedded font.
    const forceFont = `body,button,input,textarea,*{font-family:'Liberation Sans',sans-serif!important;}`;
    const tag = `<style>${css}${forceFont}</style>`;
    return html.includes('</head>')
        ? html.replace('</head>', `${tag}</head>`)
        : `${tag}${html}`;
}

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
        await page.setViewport({
            width:  Math.round(widthMm  * 3.7795), // mm → px a 96dpi
            height: Math.round(heightMm * 3.7795),
            deviceScaleFactor: 2,
        });

        await page.setContent(_injectFonts(html), { waitUntil: 'networkidle0' });

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
 * Renderiza HTML em PNG a 203 DPI — resolução nativa das impressoras de etiqueta TSPL.
 * Usado por printHtml() para enviar ao CUPS via imagetoraster, evitando o filtro
 * Ghostscript (gstoraster) que falha com PDFs gerados pelo Puppeteer.
 *
 * @param {string} html      — HTML completo da etiqueta
 * @param {number} widthMm   — largura em mm
 * @param {number} heightMm  — altura em mm
 * @param {string} outPath   — caminho do arquivo PNG de saída
 */
async function renderHtmlToPng(html, widthMm, heightMm, outPath) {
    const browser = await _getBrowser();
    const page    = await browser.newPage();

    try {
        // Viewport em 96dpi (tamanho de tela) para que o HTML se comporte como foi desenhado.
        // deviceScaleFactor eleva a resolução do screenshot para 203dpi (nativo da impressora).
        const outW  = Math.round(widthMm  * 203 / 25.4);
        const outH  = Math.round(heightMm * 203 / 25.4);
        const viewW = Math.round(widthMm  * 96  / 25.4);
        const viewH = Math.round(heightMm * 96  / 25.4);
        const scale = outW / viewW; // ≈ 2.115

        await page.setViewport({ width: viewW, height: viewH, deviceScaleFactor: scale });
        await page.setContent(_injectFonts(html), { waitUntil: 'networkidle0' });
        await page.screenshot({ path: outPath, type: 'png', fullPage: false, omitBackground: false });

        logger.info(`[Renderer] PNG gerado: ${outPath} (${widthMm}x${heightMm}mm @ 203dpi → ${outW}x${outH}px)`);
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

module.exports = { renderHtmlToPdf, renderHtmlToPng, closeBrowser };
