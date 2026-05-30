/**
 * tspl.js
 * Gera comandos TSPL a partir de uma imagem PNG via ImageMagick.
 *
 * Usado para impressoras de etiqueta TSPL quando o filtro ShippingPrinter
 * do CUPS é incompatível com o URI USB reportado pelo kernel (ex: LabelPrinter4xxA2).
 * O buffer gerado é enviado diretamente a uma fila raw do CUPS, sem filtros.
 */

const { exec } = require('child_process');
const fs       = require('fs');
const logger   = require('./logger');

function execAsync(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
            if (err) return reject(Object.assign(err, { stderr }));
            resolve({ stdout, stderr });
        });
    });
}

/**
 * Converte PNG em buffer TSPL pronto para envio a uma fila raw do CUPS.
 *
 * @param {string} pngPath  - caminho do PNG de entrada
 * @param {number} widthMm  - largura da etiqueta em mm
 * @param {number} heightMm - altura da etiqueta em mm
 * @param {number} gapMm    - espaço entre etiquetas em mm (padrão 3)
 * @param {number} copies   - quantidade de cópias (padrão 1)
 * @returns {Promise<Buffer>}
 */
async function pngToTspl(pngPath, widthMm, heightMm, gapMm = 3, copies = 1) {
    const tmpPbm = pngPath.replace(/\.[^.]+$/, '.pbm');

    try {
        // Converte para PBM P4 (1-bit binário) via ImageMagick.
        // -negate necessário: esta impressora usa bit 0 = ponto impresso (preto), bit 1 = branco,
        // oposto da convenção PBM padrão (1 = preto). O -negate inverte os bits antes de gravar.
        await execAsync(`convert '${pngPath}' -colorspace Gray -threshold 50% -negate -depth 1 'pbm:${tmpPbm}'`);

        const raw              = fs.readFileSync(tmpPbm);
        const { w, h, offset } = _parsePbmHeader(raw);
        const bitmap           = raw.slice(offset);
        const wBytes           = Math.ceil(w / 8);

        logger.info(`[TSPL] Bitmap: ${w}x${h}px, ${wBytes} bytes/linha`);

        const header = Buffer.from(
            `SIZE ${widthMm} mm,${heightMm} mm\r\n` +
            `GAP ${gapMm} mm,0\r\n` +
            `CLS\r\n` +
            `BITMAP 0,0,${wBytes},${h},0,`,
            'ascii'
        );
        const footer = Buffer.from(`\r\nPRINT ${copies}\r\n`, 'ascii');

        return Buffer.concat([header, bitmap, footer]);

    } finally {
        try { fs.unlinkSync(tmpPbm); } catch {}
    }
}

function _parsePbmHeader(buf) {
    let pos = 0;

    const readToken = () => {
        while (pos < buf.length) {
            const ch = buf[pos];
            if (ch === 35) { // '#' comment — pula até fim da linha
                while (pos < buf.length && buf[pos] !== 10) pos++;
            } else if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
                pos++;
            } else {
                break;
            }
        }
        let token = '';
        while (pos < buf.length && buf[pos] > 32) {
            token += String.fromCharCode(buf[pos++]);
        }
        return token;
    };

    const magic = readToken();
    if (magic !== 'P4') throw new Error(`PBM inválido: esperava P4, obteve "${magic}"`);

    const w = parseInt(readToken(), 10);
    const h = parseInt(readToken(), 10);
    pos++; // único espaço em branco que separa o header dos dados binários

    if (isNaN(w) || isNaN(h)) throw new Error('PBM: dimensões inválidas no header');

    return { w, h, offset: pos };
}

module.exports = { pngToTspl };
