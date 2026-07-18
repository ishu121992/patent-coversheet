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
  selectCoversheetTemplateFile: () => ipcRenderer.invoke('select-coversheet-template-file'),
  selectCoversheetOutputDirectory: () => ipcRenderer.invoke('select-coversheet-output-directory'),
  
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
  
  // Coversheet extraction operations
  extractCoversheetData: (applicationNumbers) => ipcRenderer.invoke('extract-coversheet-data', applicationNumbers),
  generateCoversheetFiles: (records) => ipcRenderer.invoke('generate-coversheet-files', records),
  
  // View management
  loadView: (viewName) => ipcRenderer.invoke('load-view', viewName),
  
  // Utility functions for the renderer
  platform: process.platform,
  versions: process.versions
});
