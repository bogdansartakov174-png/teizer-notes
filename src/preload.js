const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teizerAPI', {
  getData: () => ipcRenderer.invoke('get-data'),
  saveNotes: (notes) => ipcRenderer.invoke('save-notes', notes),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload),
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close: () => ipcRenderer.send('win-close'),
});
