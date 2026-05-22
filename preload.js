const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  openBackground: () => ipcRenderer.invoke('dialog:openBackground'),
  getSavePath: () => ipcRenderer.invoke('dialog:getSavePath'),
  startFileWrite: (savePath) => ipcRenderer.invoke('file:startWrite', savePath),
  writeFileChunk: (chunkArrayBuffer) => {
    // Convert ArrayBuffer to Uint8Array so it transfers cleanly over IPC
    const uint8Array = new Uint8Array(chunkArrayBuffer);
    return ipcRenderer.invoke('file:writeChunk', uint8Array);
  },
  closeFile: () => ipcRenderer.invoke('file:close')
});
