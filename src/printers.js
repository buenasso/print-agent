/**
 * printers.js
 * Operações com impressoras — cross-platform (Windows + macOS)
 *
 * Responsabilidades:
 * - Listar impressoras instaladas no sistema
 * - Enviar dados RAW (ESC/POS) diretamente para impressoras
 * - Imprimir arquivos PDF
 *
 * ── ESTRATÉGIA POR SO ──────────────────────────────────────
 * Windows:
 *   - Listar  → PowerShell Get-Printer
 *   - RAW     → Win32 Spooler API via .NET (PowerShell)
 *   - PDF     → pdf-to-printer (PDFtoPrinter.exe)
 *
 * macOS:
 *   - Listar  → lpstat -a (CUPS)
 *   - RAW     → lp -d printer -o raw (CUPS)
 *   - PDF     → lp -d printer (CUPS nativo pra PDFs)
 * ────────────────────────────────────────────────────────────
 */

const { exec }  = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const { DEFAULT_ENCODING, PRINT_TIMEOUT } = require('./config');

// ── Detecta o SO uma vez no boot ──────────────────────────
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// ── pdf-to-printer só funciona no Windows ─────────────────
// No macOS usamos o CUPS (lp) diretamente
let printPDFWin = null;
if (IS_WIN) {
    try {
        printPDFWin = require('pdf-to-printer').print;
    } catch (_) {
        console.warn('[Printers] pdf-to-printer não disponível (esperado no macOS)');
    }
}

// ============================================
// HELPERS
// ============================================

/** Executa comando shell e retorna stdout como Promise */
function execAsync(cmd, options = {}) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: PRINT_TIMEOUT, ...options }, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve({ stdout, stderr });
        });
    });
}

/** Escapa aspas para uso em shell
 *  Windows (cmd.exe): escapa aspas duplas (as simples são literais no cmd)
 *  macOS/Linux:       escapa aspas simples via break-out ('\'' trick)
 */
function shellEscape(str) {
    if (IS_WIN) return str.replace(/"/g, '\\"');
    return str.replace(/'/g, "'\\''");
}

// ============================================
// LISTAR IMPRESSORAS
// ============================================

/**
 * Retorna a lista de impressoras instaladas no sistema.
 * Detecta o SO e usa o comando apropriado.
 *
 * Cada impressora é retornada como objeto:
 *   { name: "queue_name", displayName: "Nome amigável" }
 *
 * - name        → identificador do sistema (usado nos comandos de impressão)
 * - displayName → nome legível pro usuário (exibido no SaaS)
 *
 * @returns {Promise<Array<{name: string, displayName: string}>>}
 */
async function listPrinters() {
    try {
        if (IS_WIN) return await listPrintersWindows();
        if (IS_MAC) return await listPrintersMac();

        console.warn('[Printers] SO não suportado:', process.platform);
        return [];
    } catch (err) {
        console.error('[Printers] Erro ao listar:', err.message);
        return [];
    }
}

/**
 * Windows: lista via PowerShell Get-Printer
 * Retorna Name (identificador) e Comment ou ShareName como displayName.
 * Se não tiver nome amigável, usa o próprio Name.
 */
async function listPrintersWindows() {
    // Usa -EncodedCommand (base64 UTF-16LE) para evitar que o cmd.exe
    // interprete o pipe "|" como separador de comandos antes de chegar ao PowerShell
    const script  = 'Get-Printer | Select-Object Name, Comment, ShareName | ConvertTo-Json';
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const cmd     = `powershell -NoProfile -EncodedCommand ${encoded}`;
    const { stdout } = await execAsync(cmd, { timeout: 5000 });

    const parsed = JSON.parse(stdout.trim());
    // PowerShell retorna objeto se só tem 1, array se tem vários
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items.filter(Boolean).map(p => ({
        name:        p.Name,
        displayName: p.Comment || p.ShareName || p.Name,
    }));
}

/**
 * macOS: lista via lpstat -a (nomes das filas) + lpoptions (nome amigável)
 *
 * O lpstat retorna o queue name (ex: "192_168_1_100").
 * O lpoptions retorna o campo printer-info com o nome amigável
 * (ex: "EPSON TM-T20X") definido no painel Impressoras do macOS.
 *
 * Se printer-info não existir, usa o queue name como fallback.
 */
async function listPrintersMac() {
    const { stdout } = await execAsync('lpstat -a', { timeout: 5000 });

    if (!stdout.trim()) return [];

    const queueNames = stdout.trim().split('\n')
        .map(line => line.split(/\s+/)[0])
        .filter(Boolean);

    // Busca o nome amigável de cada fila via lpoptions
    const printers = await Promise.all(
        queueNames.map(async (queueName) => {
            const displayName = await getPrinterDisplayName(queueName);
            return {
                name:        queueName,
                displayName: displayName || queueName,
            };
        })
    );

    return printers;
}

/**
 * Busca o nome amigável (printer-info) de uma fila CUPS no macOS.
 * Usa lpoptions -p QUEUE que retorna pares chave=valor.
 *
 * @param {string} queueName — nome da fila CUPS
 * @returns {Promise<string|null>} — nome amigável ou null
 */
async function getPrinterDisplayName(queueName) {
    try {
        const safeName = shellEscape(queueName);
        const { stdout } = await execAsync(`lpoptions -p '${safeName}'`, { timeout: 3000 });

        // lpoptions retorna pares chave=valor separados por espaço
        // Valores com espaço vêm entre aspas: printer-info='Elgin i9'
        const match = stdout.match(/printer-info='([^']*)'/) ||
                      stdout.match(/printer-info=(\S+)/);
        return match ? match[1].trim() : null;
    } catch (_) {
        return null;
    }
}

// ============================================
// IMPRESSÃO RAW (ESC/POS)
// ============================================

/**
 * Envia dados RAW para a impressora.
 * Detecta o SO e usa o método apropriado.
 *
 * @param {string}   printerName — nome exato da impressora no sistema
 * @param {string[]} data        — array de strings com comandos ESC/POS
 * @param {string}   [encoding]  — encoding dos dados (padrão: latin1/ISO-8859-1)
 * @returns {Promise<boolean>}   — true se enviou com sucesso
 */
async function printRaw(printerName, data, encoding = DEFAULT_ENCODING) {
    // Concatena os dados e grava em arquivo temporário
    const rawString = data.join('');
    const buffer    = Buffer.from(rawString, encoding);
    const tmpFile   = path.join(os.tmpdir(), `print-agent-${Date.now()}.raw`);

    fs.writeFileSync(tmpFile, buffer);

    try {
        if (IS_WIN) return await printRawWindows(printerName, tmpFile);
        if (IS_MAC) return await printRawMac(printerName, tmpFile);

        console.warn('[Printers] SO não suportado para RAW print');
        return false;
    } finally {
        // Limpa arquivo temporário
        try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
}

/**
 * Windows: RAW print via Win32 Spooler API (.NET/PowerShell)
 *
 * Usa a API nativa do Windows para abrir o spooler, criar
 * um documento RAW e escrever os bytes diretamente.
 * Mesmo método que o QZ Tray usa internamente.
 *
 * ── POR QUE NÃO USAR COPY /B ou Out-Printer? ──────────────
 * - COPY /B só funciona com portas LPT/COM, não com USB
 * - Out-Printer converte pra texto e mata os comandos ESC/POS
 * - A Spooler API funciona com qualquer impressora Windows
 * ────────────────────────────────────────────────────────────
 */
const RAW_PRINT_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFileToPrinter(string szPrinterName, string szFileName)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero))
            return false;

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "PrintAgent RAW Document";
        di.pDataType = "RAW";

        if (!StartDocPrinter(hPrinter, 1, di))
        {
            ClosePrinter(hPrinter);
            return false;
        }

        StartPagePrinter(hPrinter);

        byte[] bytes = File.ReadAllBytes(szFileName);
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

        int dwWritten;
        bool success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);

        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return success;
    }
}
"@

[RawPrinterHelper]::SendFileToPrinter($args[0], $args[1])
`;

async function printRawWindows(printerName, tmpFile) {
    // Grava o script PowerShell em temp
    const tmpScript = path.join(os.tmpdir(), 'print-agent-raw.ps1');
    fs.writeFileSync(tmpScript, RAW_PRINT_SCRIPT, 'utf8');

    const safePrinter = shellEscape(printerName);
    // cmd.exe não interpreta aspas simples como delimitadores — usa aspas duplas
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpScript}" "${safePrinter}" "${tmpFile}"`;

    const { stdout, stderr } = await execAsync(cmd);
    const success = stdout.trim().toLowerCase() === 'true';

    if (!success) {
        console.error('[Printers] Spooler retornou falha. stderr:', stderr);
    } else {
        console.log('[Printers] RAW job enviado para:', printerName);
    }

    return success;
}

/**
 * macOS: RAW print via CUPS (comando lp)
 *
 * O flag -o raw diz ao CUPS para enviar os bytes diretamente
 * ao driver sem nenhum processamento/filtro.
 */
async function printRawMac(printerName, tmpFile) {
    const safePrinter = shellEscape(printerName);
    const cmd = `lp -d '${safePrinter}' -o raw '${tmpFile}'`;

    try {
        await execAsync(cmd);
        console.log('[Printers] RAW job enviado para:', printerName);
        return true;
    } catch (err) {
        console.error('[Printers] Erro RAW print (CUPS):', err.message);
        return false;
    }
}

// ============================================
// IMPRESSÃO PDF
// ============================================

/**
 * Imprime um PDF na impressora especificada.
 * Aceita o PDF como base64 — decodifica, salva em temp e imprime.
 *
 * @param {string} printerName — nome da impressora
 * @param {string} base64Data  — conteúdo do PDF em base64
 * @param {object} [options]   — opções extras (copies, etc.)
 * @returns {Promise<boolean>}
 */
async function printPdf(printerName, base64Data, options = {}) {
    const tmpFile = path.join(os.tmpdir(), `print-agent-${Date.now()}.pdf`);

    try {
        // Decodifica e salva o PDF
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(tmpFile, buffer);

        if (IS_WIN) return await printPdfWindows(printerName, tmpFile, options);
        if (IS_MAC) return await printPdfMac(printerName, tmpFile, options);

        console.warn('[Printers] SO não suportado para PDF print');
        return false;

    } catch (err) {
        console.error('[Printers] Erro PDF print:', err.message);
        return false;

    } finally {
        // Limpa arquivo temporário
        try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
}

/** Windows: PDF via pdf-to-printer (PDFtoPrinter.exe) */
async function printPdfWindows(printerName, tmpFile, options) {
    if (!printPDFWin) {
        console.error('[Printers] pdf-to-printer não disponível');
        return false;
    }

    await printPDFWin(tmpFile, { printer: printerName, ...options });
    console.log('[Printers] PDF enviado para:', printerName);
    return true;
}

/**
 * macOS: PDF via CUPS (comando lp)
 * O CUPS do macOS renderiza PDFs nativamente — não precisa de lib extra.
 */
async function printPdfMac(printerName, tmpFile, options) {
    const safePrinter = shellEscape(printerName);

    // Monta opções do lp (ex: cópias)
    let flags = `-d '${safePrinter}'`;
    if (options.copies && options.copies > 1) {
        flags += ` -n ${parseInt(options.copies, 10)}`;
    }

    const cmd = `lp ${flags} '${tmpFile}'`;

    try {
        await execAsync(cmd);
        console.log('[Printers] PDF enviado para:', printerName);
        return true;
    } catch (err) {
        console.error('[Printers] Erro PDF print (CUPS):', err.message);
        return false;
    }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    listPrinters,
    printRaw,
    printPdf,
};
