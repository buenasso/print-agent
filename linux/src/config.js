const os   = require('os');
const path = require('path');

module.exports = {

    FIREBASE_CONFIG: {
        apiKey:            'AIzaSyBofXL8ZtwnPFcEKcSY09tSuleubiBL_KQ',
        authDomain:        'operacao-facil.firebaseapp.com',
        projectId:         'operacao-facil',
        storageBucket:     'operacao-facil.firebasestorage.app',
        messagingSenderId: '161013396280',
        appId:             '1:161013396280:web:44a1e13aef73ee56e007cd',
    },

    PORT:    12080,

    ALLOWED_ORIGINS: [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://portal.distritopizza.com.br',
    ],

    VERSION: '1.3.0',

    DEFAULT_ENCODING: 'latin1',

    PRINT_TIMEOUT: 15000,

    // Diretório de configuração por usuário (~/.config/print-agent/)
    CONFIG_DIR: path.join(os.homedir(), '.config', 'print-agent'),

    // Arquivo de auth (refresh token) — protegido com chmod 600
    AUTH_FILE: path.join(os.homedir(), '.config', 'print-agent', 'auth.json'),

    // Arquivo de config da loja selecionada
    STORE_FILE: path.join(os.homedir(), '.config', 'print-agent', 'store.json'),

    // Diretório de logs
    LOG_DIR: path.join(os.homedir(), '.local', 'share', 'print-agent', 'logs'),

    // Caminho do Chromium instalado via apt no Ubuntu
    CHROMIUM_PATH: '/usr/bin/chromium-browser',

    // TTL do cache de impressoras (ms)
    PRINTERS_TTL: 60_000,
};
