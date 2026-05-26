/**
 * auth.js
 * Fluxo de autenticação CLI interativo.
 *
 * Comandos:
 *   login()       → pede email/senha, salva refresh token, lista lojas para seleção
 *   selectStore() → lista lojas e permite trocar a loja ativa
 *   logout()      → revoga token local e limpa os arquivos de estado
 */

const { input, password, select } = require('@inquirer/prompts');
const { signIn, fetchUserStores }  = require('./firebase');
const state                        = require('./state');

async function login() {
    console.log('\n  OF Print Agent — Login\n');

    const email = await input({
        message: 'Email:',
        validate: v => v.includes('@') || 'Email inválido',
    });

    const senha = await password({
        message: 'Senha:',
        mask: '•',
    });

    console.log('\n  Autenticando...');

    let user;
    try {
        user = await signIn(email, senha);
    } catch (err) {
        const msg = _friendlyAuthError(err.code || err.message);
        console.error(`\n  ✗ ${msg}\n`);
        process.exit(1);
    }

    // Salva refresh token (nunca email/senha)
    state.saveAuth({
        refreshToken: user.stsTokenManager.refreshToken,
        uid:          user.uid,
        email:        user.email,
    });

    console.log(`  ✓ Autenticado como ${user.email}\n`);

    await selectStore(user.uid);
}

async function selectStore(uid) {
    if (!uid) {
        const auth = state.getAuth();
        if (!auth) {
            console.error('  ✗ Não autenticado. Rode: print-agent login\n');
            process.exit(1);
        }
        uid = auth.uid;
    }

    console.log('  Buscando lojas disponíveis...\n');

    let stores;
    try {
        stores = await fetchUserStores(uid);
    } catch (err) {
        console.error(`  ✗ Erro ao buscar lojas: ${err.message}\n`);
        process.exit(1);
    }

    if (stores.length === 0) {
        console.error('  ✗ Nenhuma loja encontrada para este usuário.\n');
        process.exit(1);
    }

    const choices = stores.map(s => ({
        name:  `${s.storeName} (${s.groupName})`,
        value: s,
    }));

    const chosen = await select({
        message: 'Selecione a loja:',
        choices,
    });

    state.saveStore({
        groupId:   chosen.groupId,
        storeId:   chosen.storeId,
        storeName: chosen.storeName,
        groupName: chosen.groupName,
    });

    console.log(`\n  ✓ Loja "${chosen.storeName}" configurada.\n`);
    console.log('  Para iniciar o daemon: print-agent start');
    console.log('  Para instalar como serviço: print-agent install\n');
}

function logout() {
    state.clear();
    console.log('\n  ✓ Sessão encerrada. Token local removido.\n');
    console.log('  Para revogar o token no Firebase, acesse o Console Firebase');
    console.log('  → Authentication → Usuários → Revogar tokens\n');
}

function _friendlyAuthError(code) {
    const map = {
        'auth/invalid-credential':      'Email ou senha incorretos.',
        'auth/user-not-found':          'Usuário não encontrado.',
        'auth/wrong-password':          'Senha incorreta.',
        'auth/too-many-requests':       'Muitas tentativas. Aguarde alguns minutos.',
        'auth/network-request-failed':  'Sem conexão com a internet.',
        'auth/user-disabled':           'Conta desabilitada. Contate o suporte.',
    };
    return map[code] || `Erro de autenticação: ${code}`;
}

module.exports = { login, selectStore, logout };
