/**
 * firebase.js
 * Inicialização do Firebase SDK no processo principal (Node.js).
 *
 * Usa inMemoryPersistence para auth — credenciais são restauradas em
 * cada inicialização a partir do electron-store (app-state.js).
 *
 * ── ESTRUTURA ESPERADA NO FIRESTORE ────────────────────────────────────────
 *   users/{uid}
 *     permissions: {
 *       [groupId]: { stores: ['storeId', ...] }
 *     }
 *     god_mode: boolean  (opcional — acesso a todos os grupos/lojas)
 * ───────────────────────────────────────────────────────────────────────────
 */

const { initializeApp }                               = require('firebase/app');
const { getAuth, signInWithEmailAndPassword,
        signOut: fbSignOut, setPersistence,
        inMemoryPersistence }                         = require('firebase/auth');
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

async function signIn(email, password) {
    _init();
    const cred = await signInWithEmailAndPassword(_auth, email, password);
    return cred.user;
}

async function signOut() {
    if (_auth) await fbSignOut(_auth);
}

/**
 * Retorna a lista de lojas disponíveis para o uid fornecido.
 * god_mode = true → todas as lojas de todos os grupos.
 * Ajuste o caminho `users/{uid}` se sua estrutura for diferente.
 */
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

module.exports = { signIn, signOut, fetchUserStores, getFirestoreInstance, getAuthInstance };
