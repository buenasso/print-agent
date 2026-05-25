/**
 * app-state.js
 * Persistência de credenciais e loja selecionada via electron-store.
 * O arquivo é gravado em userData/ com criptografia AES-256.
 */

const Store = require('electron-store');

const store = new Store({
    name:          'config',
    encryptionKey: 'of-print-agent-v1',
});

module.exports = {
    getCredentials() {
        return {
            email:    store.get('email',    null),
            password: store.get('password', null),
        };
    },

    saveCredentials(email, password) {
        store.set('email',    email);
        store.set('password', password);
    },

    getSelectedStore() {
        return {
            groupId:   store.get('groupId',   null),
            storeId:   store.get('storeId',   null),
            storeName: store.get('storeName', null),
            groupName: store.get('groupName', null),
        };
    },

    saveSelectedStore({ groupId, storeId, storeName, groupName }) {
        store.set('groupId',   groupId);
        store.set('storeId',   storeId);
        store.set('storeName', storeName);
        store.set('groupName', groupName);
    },

    clear() {
        store.clear();
    },

    isReady() {
        return !!(store.get('email') && store.get('password') && store.get('storeId'));
    },
};
