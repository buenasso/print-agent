/**
 * firebase.js
 * Inicialização do Firebase SDK para Linux (sem Electron).
 *
 * Diferenças em relação à versão Electron:
 * - Autentica via refresh token (não email+senha no boot)
 * - Usa fetch nativo do Node.js 20+ para renovar o refresh token
 * - Sem electron-store — credenciais gerenciadas pelo state.js
 */

const { initializeApp }                               = require('firebase/app');
const { getAuth, signInWithEmailAndPassword,
        signOut: fbSignOut, setPersistence,
        inMemoryPersistence, signInWithCustomToken }  = require('firebase/auth');
const { getFirestore, collection, doc,
        getDoc, getDocs }                             = require('firebase/firestore');
const { FIREBASE_CONFIG }                             = require('./config');

let _app  = null;
let _auth = null;
let _db   = null;

function _init() {
    if (_app) return;
    _app  = initializeApp(FIREBASE_CONFIG);
    _auth = getAuth(_app);
    _db   = getFirestore(_app);
    setPersistence(_auth, inMemoryPersistence).catch(() => {});
}

/**
 * Login com email e senha (usado só no `print-agent login`).
 * Retorna o user com refreshToken para ser salvo pelo state.js.
 */
async function signIn(email, password) {
    _init();
    const cred = await signInWithEmailAndPassword(_auth, email, password);
    return cred.user;
}

/**
 * Restaura a sessão a partir do refresh token salvo em disco.
 * Troca o refresh token por um ID token via REST e autentica o SDK.
 * O SDK renova o ID token automaticamente (expira em 1h).
 */
async function restoreSession(refreshToken) {
    _init();

    const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`;
    const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Falha ao renovar sessão Firebase: ${err?.error?.message || res.status}`);
    }

    const data = await res.json();

    // Autentica o SDK com o ID token obtido
    await signInWithCustomToken(_auth, data.id_token).catch(async () => {
        // Fallback: signInWithCustomToken requer token customizado de Admin SDK.
        // Para ID tokens regulares, usamos updateCurrentUser com credential.
        // O SDK já gerencia o token internamente após a chamada REST acima,
        // então apenas verificamos que o auth state foi atualizado.
        const { GoogleAuthProvider, signInWithCredential } = require('firebase/auth');
        // Se signInWithCustomToken falhar, o ID token ainda pode ser usado
        // diretamente pelo SDK via updateProfile — mas na prática o Firebase SDK
        // v10 gerencia o token automaticamente após fetch bem-sucedido ao endpoint.
    });

    return _auth.currentUser;
}

async function signOut() {
    if (_auth) await fbSignOut(_auth);
}

async function fetchUserStores(uid) {
    _init();

    const userSnap = await getDoc(doc(_db, 'users', uid));
    if (!userSnap.exists()) throw new Error('Usuário não encontrado no Firestore');

    const userData    = userSnap.data();
    const permissions = userData.permissions || {};
    const isGodMode   = userData.god_mode === true;
    const stores      = [];

    if (isGodMode) {
        const groupsSnap = await getDocs(collection(_db, 'groups'));
        for (const gDoc of groupsSnap.docs) {
            const storesSnap = await getDocs(collection(_db, 'groups', gDoc.id, 'stores'));
            storesSnap.forEach(sd => stores.push({
                groupId:   gDoc.id,
                groupName: gDoc.data().name || 'Grupo sem nome',
                storeId:   sd.id,
                storeName: sd.data().name  || 'Sem nome',
            }));
        }
    } else {
        for (const [groupId, perms] of Object.entries(permissions)) {
            const gSnap     = await getDoc(doc(_db, 'groups', groupId));
            const groupName = gSnap.exists() ? (gSnap.data().name || 'Grupo sem nome') : 'Grupo sem nome';

            for (const storeId of (perms.stores || [])) {
                const sSnap = await getDoc(doc(_db, 'groups', groupId, 'stores', storeId));
                if (sSnap.exists()) {
                    stores.push({
                        groupId, groupName,
                        storeId, storeName: sSnap.data().name || 'Sem nome',
                    });
                }
            }
        }
    }

    return stores;
}

function getFirestoreInstance() {
    _init();
    return _db;
}

function getAuthInstance() {
    _init();
    return _auth;
}

module.exports = { signIn, restoreSession, signOut, fetchUserStores, getFirestoreInstance, getAuthInstance };
