const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // API key management
  saveApiKeys: (apiKeys) => ipcRenderer.invoke('save-api-keys', apiKeys),
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  
  // Download settings management
  saveDownloadSettings: (settings) => ipcRenderer.invoke('save-download-settings', settings),
  loadDownloadSettings: () => ipcRenderer.invoke('load-download-settings'),
  
  // Directory selection
  selectDownloadDirectory: () => ipcRenderer.invoke('select-download-directory'),
  
  // Patent download
  downloadPatent: (options) => ipcRenderer.invoke('download-patent', options),
  
  // File operations
  openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  
  // USPTO File Wrapper operations
  fetchFileWrapperDocuments: (applicationNumber) => ipcRenderer.invoke('fetch-file-wrapper-documents', applicationNumber),
  downloadFileWrapperDocuments: (options) => ipcRenderer.invoke('download-file-wrapper-documents', options),
  onFileWrapperProgress: (callback) => ipcRenderer.on('file-wrapper-progress', (event, data) => callback(data)),
  
  // View management
  loadView: (viewName) => ipcRenderer.invoke('load-view', viewName),
  
  // Utility functions for the renderer
  platform: process.platform,
  versions: process.versions
});
