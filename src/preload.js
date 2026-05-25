/**
 * preload.js
 * Bridge IPC entre o renderer (auth.html) e o processo principal.
 * Expõe apenas os métodos necessários via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
    login:       (data)  => ipcRenderer.invoke('auth:login', data),
    selectStore: (store) => ipcRenderer.invoke('auth:selectStore', store),
    cancel:      ()      => ipcRenderer.send('auth:cancel'),
    onInit:      (cb)    => ipcRenderer.on('auth:init', (_, data) => cb(data)),
});
