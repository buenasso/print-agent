/**
 * config.js
 * Configurações centrais do Print Agent
 *
 * O agente é propositalmente "burro" — sem tela de configuração.
 * Tudo que precisa de ajuste fica aqui, mas na prática o padrão
 * funciona pra maioria dos cenários.
 *
 * ── MODIFICÁVEIS ──────────────────────────────────────────────
 * PORT           → porta do servidor HTTP local
 * ALLOWED_ORIGINS → domínios do SaaS que podem chamar a API
 * ──────────────────────────────────────────────────────────────
 */

module.exports = {

    // ── Firebase ────────────────────────────────────────────────────────────
    // Copie estes valores do Firebase Console → Configurações do projeto →
    // Seus apps → SDK setup and configuration.
    // Estes valores são públicos (segurança vem das Firestore Rules).
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyBofXL8ZtwnPFcEKcSY09tSuleubiBL_KQ",
        authDomain: "operacao-facil.firebaseapp.com",
        projectId: "operacao-facil",
        storageBucket: "operacao-facil.firebasestorage.app",
        messagingSenderId: "161013396280",
        appId: "1:161013396280:web:44a1e13aef73ee56e007cd"
    },

    // Porta fixa do servidor local
    PORT: 12080,

    // Origens permitidas pelo CORS
    // Adicione aqui o domínio de produção e de dev do SaaS
    ALLOWED_ORIGINS: [
        'http://localhost:5173',                // Vite dev
        'http://localhost:3000',                // Dev alternativo
        'https://portal.distritopizza.com.br',  // Produção
    ],

    // Versão exposta no endpoint /status
    VERSION: '1.3.0',

    // Encoding padrão para impressão RAW (ESC/POS)
    // latin1 = ISO-8859-1 (padrão de impressoras térmicas)
    DEFAULT_ENCODING: 'latin1',

    // Tempo máximo (ms) para considerar que uma impressão travou
    PRINT_TIMEOUT: 15000,
};
