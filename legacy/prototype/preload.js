const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    enterPetMode: () => ipcRenderer.send('enter-pet-mode'),
    exitPetMode: () => ipcRenderer.send('exit-pet-mode')
});