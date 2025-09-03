const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // API key management
  saveApiKeys: (apiKeys) => ipcRenderer.invoke('save-api-keys', apiKeys),
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  
  // View management
  loadView: (viewName) => ipcRenderer.invoke('load-view', viewName),
  
  // Utility functions for the renderer
  platform: process.platform,
  versions: process.versions
});
