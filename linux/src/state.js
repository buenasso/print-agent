/**
 * state.js
 * Substituto do electron-store para Linux.
 * Persiste auth (refresh token) e loja selecionada em arquivos JSON
 * separados sob ~/.config/print-agent/, com permissões seguras.
 */

const fs   = require('fs');
const path = require('path');
const { CONFIG_DIR, AUTH_FILE, STORE_FILE } = require('./config');

function _ensureDir() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function _readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function _writeJson(file, data) {
    _ensureDir();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
}

// ── Auth (refresh token) ──────────────────────────────────────────────────────

function getAuth() {
    return _readJson(AUTH_FILE);
}

function saveAuth({ refreshToken, uid, email }) {
    _writeJson(AUTH_FILE, { refreshToken, uid, email });
}

function clearAuth() {
    try { fs.unlinkSync(AUTH_FILE); } catch {}
}

function hasAuth() {
    return !!getAuth()?.refreshToken;
}

// ── Loja selecionada ──────────────────────────────────────────────────────────

function getStore() {
    return _readJson(STORE_FILE);
}

function saveStore({ groupId, storeId, storeName, groupName }) {
    _writeJson(STORE_FILE, { groupId, storeId, storeName, groupName });
}

function clearStore() {
    try { fs.unlinkSync(STORE_FILE); } catch {}
}

function isReady() {
    return hasAuth() && !!getStore()?.storeId;
}

function clear() {
    clearAuth();
    clearStore();
}

module.exports = {
    getAuth, saveAuth, clearAuth, hasAuth,
    getStore, saveStore, clearStore,
    isReady, clear,
};
