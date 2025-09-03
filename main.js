const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Path to store API keys
const configPath = path.join(__dirname, 'config.json');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // Optional: add app icon
    show: false
  });

  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// App event listeners
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for API key management
ipcMain.handle('save-api-keys', async (event, apiKeys) => {
  try {
    const configData = {
      usptoApiKey: apiKeys.usptoApiKey || '',
      espacenetConsumerKey: apiKeys.espacenetConsumerKey || '',
      espacenetSecretKey: apiKeys.espacenetSecretKey || ''
    };
    
    await fs.promises.writeFile(configPath, JSON.stringify(configData, null, 2));
    return { success: true, message: 'API keys saved successfully' };
  } catch (error) {
    console.error('Error saving API keys:', error);
    return { success: false, message: 'Failed to save API keys' };
  }
});

ipcMain.handle('load-api-keys', async () => {
  try {
    if (fs.existsSync(configPath)) {
      const configData = await fs.promises.readFile(configPath, 'utf8');
      return { success: true, data: JSON.parse(configData) };
    } else {
      // Return default empty config if file doesn't exist
      return { 
        success: true, 
        data: { 
          usptoApiKey: '', 
          espacenetConsumerKey: '', 
          espacenetSecretKey: '' 
        } 
      };
    }
  } catch (error) {
    console.error('Error loading API keys:', error);
    return { success: false, message: 'Failed to load API keys' };
  }
});

// IPC handler for loading view content
ipcMain.handle('load-view', async (event, viewName) => {
  try {
    const viewPath = path.join(__dirname, 'views', `${viewName}.html`);
    if (fs.existsSync(viewPath)) {
      const viewContent = await fs.promises.readFile(viewPath, 'utf8');
      return { success: true, content: viewContent };
    } else {
      return { success: false, message: `View ${viewName} not found` };
    }
  } catch (error) {
    console.error('Error loading view:', error);
    return { success: false, message: 'Failed to load view' };
  }
});
