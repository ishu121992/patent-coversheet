const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { PDFDocument } = require('pdf-lib');
const JSZip = require('jszip');

// Path to store API keys and settings
const configPath = path.join(__dirname, 'config.json');
const downloadSettingsPath = path.join(__dirname, 'download-settings.json');

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

// IPC handlers for download settings management
ipcMain.handle('save-download-settings', async (event, settings) => {
  try {
    console.log('ðŸ’¾ Saving download settings to:', downloadSettingsPath);
    console.log('Settings to save:', JSON.stringify(settings, null, 2));
    
    await fs.promises.writeFile(downloadSettingsPath, JSON.stringify(settings, null, 2));
    console.log('âœ… Download settings file written successfully');
    
    // Verify the file was written
    if (fs.existsSync(downloadSettingsPath)) {
      const verification = await fs.promises.readFile(downloadSettingsPath, 'utf8');
      console.log('âœ… Verification - file content:', verification);
    }
    
    return { success: true, message: 'Download settings saved successfully' };
  } catch (error) {
    console.error('âŒ Error saving download settings:', error);
    return { success: false, message: 'Failed to save download settings: ' + error.message };
  }
});

ipcMain.handle('load-download-settings', async () => {
  try {
    if (fs.existsSync(downloadSettingsPath)) {
      const settingsData = await fs.promises.readFile(downloadSettingsPath, 'utf8');
      return { success: true, data: JSON.parse(settingsData) };
    } else {
      return { 
        success: true, 
        data: { 
          downloadDirectory: '', 
          filenameFormat: 'publication-number',
          createSubfolders: false
        } 
      };
    }
  } catch (error) {
    console.error('Error loading download settings:', error);
    return { success: false, message: 'Failed to load download settings' };
  }
});

// IPC handler for directory selection
ipcMain.handle('select-download-directory', async () => {
  console.log('select-download-directory called');
  try {
    console.log('Opening directory dialog...');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Download Directory',
      buttonLabel: 'Select Folder'
    });
    
    console.log('Dialog result:', result);
    
    if (result.canceled) {
      return { success: false, message: 'Directory selection cancelled' };
    }
    
    return { success: true, directoryPath: result.filePaths[0] };
  } catch (error) {
    console.error('Error selecting directory:', error);
    return { success: false, message: 'Failed to open directory selector' };
  }
});

// IPC handler for patent download
ipcMain.handle('download-patent', async (event, options) => {
  try {
    const { publicationNumber, downloadType } = options;
    
    // Load download settings and API keys
    console.log('Loading configuration for download...');
    const downloadSettingsResult = await loadDownloadSettingsSync();
    const apiKeysResult = await loadApiKeysSync();
    
    console.log('Download settings result:', downloadSettingsResult);
    console.log('API keys result:', apiKeysResult);
    
    if (!downloadSettingsResult.success) {
      console.error('âŒ Failed to load download settings:', downloadSettingsResult.message);
      return { success: false, message: 'Failed to load download settings: ' + downloadSettingsResult.message };
    }
    
    if (!apiKeysResult.success) {
      console.error('âŒ Failed to load API keys:', apiKeysResult.message);
      return { success: false, message: 'Failed to load API keys: ' + apiKeysResult.message };
    }
    
    const settings = downloadSettingsResult.data;
    const apiKeys = apiKeysResult.data;
    
    console.log('Loaded settings:', settings);
    console.log('Download directory from settings:', settings.downloadDirectory);
    
    if (!settings.downloadDirectory) {
      console.error('âŒ Download directory not configured in settings');
      return { success: false, message: 'Download directory not configured. Please set it in Settings.' };
    }
    
    if (!apiKeys.espacenetConsumerKey || !apiKeys.espacenetSecretKey) {
      return { success: false, message: 'Espacenet API keys not configured' };
    }
    
    // Download the patent
    const downloadResult = await downloadPatentFromEPO(
      publicationNumber, 
      downloadType, 
      settings, 
      apiKeys
    );
    
    return downloadResult;
  } catch (error) {
    console.error('Error downloading patent:', error);
    return { success: false, message: 'Failed to download patent: ' + error.message };
  }
});

// IPC handler for opening file location
ipcMain.handle('open-file-location', async (event, filePath) => {
  try {
    console.log('Opening file location for:', filePath);
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('âŒ File does not exist:', filePath);
      return { success: false, message: 'File does not exist' };
    }
    
    // Import shell dynamically since it's not available at module level
    const { shell } = require('electron');
    
    // Show the file in the default file manager (Windows Explorer, Finder, etc.)
    await shell.showItemInFolder(filePath);
    
    console.log('âœ… Successfully opened file location for:', filePath);
    return { success: true };
    
  } catch (error) {
    console.error('âŒ Error opening file location:', error);
    return { success: false, message: 'Failed to open file location: ' + error.message };
  }
});

// IPC handler for opening a file with the default application
ipcMain.handle('open-path', async (event, filePath) => {
  try {
    console.log('Opening file with default application:', filePath);
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('File does not exist:', filePath);
      return { success: false, message: 'File does not exist' };
    }
    
    const { shell } = require('electron');
    await shell.openPath(filePath);
    
    console.log('Successfully opened file:', filePath);
    return { success: true };
    
  } catch (error) {
    console.error('Error opening file:', error);
    return { success: false, message: 'Failed to open file: ' + error.message };
  }
});

// IPC handler for showing an item in folder (same as open-file-location)
ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  try {
    console.log('Showing item in folder:', filePath);
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('File does not exist:', filePath);
      return { success: false, message: 'File does not exist' };
    }
    
    const { shell } = require('electron');
    await shell.showItemInFolder(filePath);
    
    console.log('Successfully showed item in folder:', filePath);
    return { success: true };
    
  } catch (error) {
    console.error('Error showing item in folder:', error);
    return { success: false, message: 'Failed to show item in folder: ' + error.message };
  }
});

// IPC handler for fetching USPTO file wrapper documents
ipcMain.handle('fetch-file-wrapper-documents', async (event, applicationNumber) => {
  try {
    console.log('Fetching file wrapper documents for application:', applicationNumber);
    
    // Format application number (remove any non-digits and pad to 8 digits)
    const formattedAppNum = applicationNumber.replace(/\D/g, '').padStart(8, '0');
    console.log('Formatted application number:', formattedAppNum);
    
    // Load USPTO API key
    const apiKeysResult = await loadApiKeysSync();
    console.log('API keys load result:', { success: apiKeysResult.success, hasUsptoKey: !!(apiKeysResult.data?.usptoApiKey) });
    
    if (!apiKeysResult.success || !apiKeysResult.data.usptoApiKey) {
      console.error('âŒ USPTO API key missing or invalid');
      return { success: false, message: 'USPTO API key not configured. Please set it in Settings.' };
    }
    
    const usptoApiKey = apiKeysResult.data.usptoApiKey;
    console.log('Using USPTO API key:', usptoApiKey.substring(0, 8) + '...' + usptoApiKey.substring(usptoApiKey.length - 4));
    
    // Validate API key format
    if (usptoApiKey.length < 10) {
      console.error('âŒ USPTO API key appears too short:', usptoApiKey.length, 'characters');
      return { success: false, message: 'USPTO API key appears to be invalid (too short). Please check your key in Settings.' };
    }
    
    // Fetch documents from USPTO API
    const documents = await fetchUsptoFileWrapperDocuments(formattedAppNum, usptoApiKey);
    
    console.log(`âœ… Successfully fetched ${documents.length} documents`);
    return { success: true, documents: documents };
    
  } catch (error) {
    console.error('âŒ Error fetching file wrapper documents:', error);
    return { success: false, message: 'Failed to fetch documents: ' + error.message };
  }
});

// IPC handler for downloading USPTO file wrapper documents
ipcMain.handle('download-file-wrapper-documents', async (event, options) => {
  try {
    const { documents, format } = options;
    console.log(`Downloading ${documents.length} documents in ${format} format`);
    
    // Get USPTO API key
    const apiKeysResult = await loadApiKeysSync();
    if (!apiKeysResult.success || !apiKeysResult.data.usptoApiKey) {
      console.error('âŒ USPTO API key missing for downloads');
      return { success: false, message: 'USPTO API key not configured. Please set it in Settings.' };
    }
    const usptoApiKey = apiKeysResult.data.usptoApiKey;
    
    // Load download settings
    const downloadSettingsResult = await loadDownloadSettingsSync();
    if (!downloadSettingsResult.success || !downloadSettingsResult.data.downloadDirectory) {
      return { success: false, message: 'Download directory not configured. Please set it in Settings.' };
    }
    
    const downloadDir = downloadSettingsResult.data.downloadDirectory;
    
    if (format === 'zip') {
      // Download as separate PDFs in a ZIP file using parallel processing
      const zipFilePath = await downloadFileWrapperAsZipParallel(documents, downloadDir, usptoApiKey, event);
      return { success: true, filePath: zipFilePath };
    } else if (format === 'merged') {
      // Download as merged PDF using parallel processing
      const mergedFilePath = await downloadFileWrapperAsMergedParallel(documents, downloadDir, usptoApiKey, event);
      return { success: true, filePath: mergedFilePath };
    } else {
      return { success: false, message: 'Invalid download format specified' };
    }
    
  } catch (error) {
    console.error('âŒ Error downloading file wrapper documents:', error);
    return { success: false, message: 'Failed to download documents: ' + error.message };
  }
});

// Helper functions
async function loadDownloadSettingsSync() {
  try {
    console.log('Checking download settings file:', downloadSettingsPath);
    console.log('File exists:', fs.existsSync(downloadSettingsPath));
    
    if (fs.existsSync(downloadSettingsPath)) {
      const settingsData = await fs.promises.readFile(downloadSettingsPath, 'utf8');
      console.log('Raw settings file content:', settingsData);
      const parsedData = JSON.parse(settingsData);
      console.log('Parsed settings data:', parsedData);
      return { success: true, data: parsedData };
    } else {
      console.log('Settings file does not exist, returning defaults');
      return { 
        success: true, 
        data: { 
          downloadDirectory: '', 
          filenameFormat: 'publication-number',
          createSubfolders: false
        } 
      };
    }
  } catch (error) {
    console.error('âŒ Error loading download settings:', error);
    return { success: false, message: 'Failed to load download settings: ' + error.message };
  }
}

async function loadApiKeysSync() {
  try {
    if (fs.existsSync(configPath)) {
      const configData = await fs.promises.readFile(configPath, 'utf8');
      return { success: true, data: JSON.parse(configData) };
    } else {
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
    return { success: false, message: 'Failed to load API keys' };
  }
}

// Global token storage with 15-minute expiration
let globalAccessToken = null;
let globalTokenExpiry = null;

async function downloadPatentFromEPO(publicationNumber, downloadType, settings, apiKeys) {
  try {
    console.log('=== EPO Download Process Started ===');
    console.log('Publication Number:', publicationNumber);
    console.log('Download Type:', downloadType);
    console.log('Settings:', JSON.stringify(settings, null, 2));
    console.log('API Keys available:', {
      hasConsumerKey: !!apiKeys.espacenetConsumerKey,
      hasSecretKey: !!apiKeys.espacenetSecretKey
    });
    
    // Step 1: Get fresh access token (manage 15-minute expiration)
    const token = await getEPOAccessTokenWithCache(apiKeys.espacenetConsumerKey, apiKeys.espacenetSecretKey);
    console.log('Access token obtained:', token ? 'SUCCESS' : 'FAILED');
    
    // Step 2: Format publication number for EPO
    const formattedPubNumber = formatPublicationNumberForEPO(publicationNumber);
    console.log('Original:', publicationNumber, '-> Formatted:', formattedPubNumber);
    
    // Step 3: Get document information
    console.log('Fetching document information from EPO API...');
    const documentInfo = await getEPODocumentInfo(formattedPubNumber, token);
    console.log('Document instances found:', documentInfo);
    
    // Step 4: Download the document
    console.log('Starting document download process...');
    const downloadResult = await downloadEPODocument(
      documentInfo, 
      downloadType, 
      publicationNumber, 
      settings, 
      token
    );
    
    console.log('Final download result:', downloadResult);
    return downloadResult;
  } catch (error) {
    console.error('âŒ EPO download error for', publicationNumber, ':', error);
    console.error('Error stack:', error.stack);
    return { success: false, message: error.message };
  }
}

async function getEPOAccessTokenWithCache(clientKey, clientSecret) {
  // Check if we have a valid cached token (tokens expire every 15 minutes)
  const now = new Date().getTime();
  if (globalAccessToken && globalTokenExpiry && now < globalTokenExpiry) {
    console.log('Using cached access token (expires in', Math.round((globalTokenExpiry - now) / 1000 / 60), 'minutes)');
    return globalAccessToken;
  }
  
  console.log('Fetching new access token (cache expired or not available)');
  const token = await getEPOAccessToken(clientKey, clientSecret);
  
  // Cache the token with 14-minute expiry (1 minute buffer)
  globalAccessToken = token;
  globalTokenExpiry = now + (14 * 60 * 1000); // 14 minutes from now
  console.log('Token cached for 14 minutes');
  
  return token;
}

function getEPOAccessToken(clientKey, clientSecret) {
  return new Promise((resolve, reject) => {
    console.log('ðŸ” Requesting new EPO access token...');
    console.log('Client Key:', clientKey ? `${clientKey.substring(0, 8)}...` : 'MISSING');
    console.log('Client Secret:', clientSecret ? `${clientSecret.substring(0, 8)}...` : 'MISSING');
    
    if (!clientKey || !clientSecret) {
      reject(new Error('EPO API credentials are missing. Please configure them in Settings.'));
      return;
    }
    
    const credentials = Buffer.from(`${clientKey}:${clientSecret}`).toString('base64');
    console.log('Base64 credentials created:', credentials.substring(0, 20) + '...');
    
    const postData = 'grant_type=client_credentials';
    
    const options = {
      hostname: 'ops.epo.org',
      port: 443,
      path: '/3.2/auth/accesstoken',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    console.log('Making request to:', `https://${options.hostname}${options.path}`);
    
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Raw response data:', data);
        
        try {
          if (res.statusCode !== 200) {
            console.error('âŒ Failed to get access token. Status:', res.statusCode);
            reject(new Error(`Failed to get access token: HTTP ${res.statusCode} - ${data}`));
            return;
          }
          
          const response = JSON.parse(data);
          console.log('Parsed token response:', response);
          
          if (response.access_token) {
            console.log('âœ… Access token received:', response.access_token.substring(0, 20) + '...');
            resolve(response.access_token);
          } else {
            reject(new Error('No access token in response: ' + JSON.stringify(response)));
          }
        } catch (error) {
          console.error('âŒ Failed to parse token response:', error);
          reject(new Error('Failed to parse access token response: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('âŒ Request error:', error);
      reject(new Error('Network error while requesting access token: ' + error.message));
    });
    
    req.write(postData);
    req.end();
  });
}

function formatPublicationNumberForEPO(publicationNumber) {
  // Convert US10721857B2 to US.10721857.B2 format
  const match = publicationNumber.match(/^([A-Z]{2})(\d+)([A-Z]\d?)$/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
  }
  return publicationNumber;
}

function getEPODocumentInfo(formattedPubNumber, accessToken) {
  return new Promise((resolve, reject) => {
    console.log('ðŸ“„ Fetching document information for:', formattedPubNumber);
    console.log('Using access token:', accessToken ? accessToken.substring(0, 20) + '...' : 'MISSING');
    
    const options = {
      hostname: 'ops.epo.org',
      port: 443,
      path: '/3.2/rest-services/published-data/publication/docdb/images',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/xml',
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(formattedPubNumber)
      }
    };
    
    console.log('Request URL:', `https://${options.hostname}${options.path}`);
    console.log('Request headers:', options.headers);
    console.log('Request body:', formattedPubNumber);
    
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log('Document info response status:', res.statusCode);
      console.log('Document info response headers:', res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Raw XML response length:', data.length);
        console.log('Raw XML response (first 500 chars):', data.substring(0, 500));
        
        try {
          if (res.statusCode !== 200) {
            console.error('âŒ Failed to get document info. Status:', res.statusCode);
            console.error('Response body:', data);
            reject(new Error(`Failed to get document info: HTTP ${res.statusCode} - ${data}`));
            return;
          }
          
          // Parse XML to get document instances
          const documentInfo = parseDocumentInstances(data);
          console.log('âœ… Document instances parsed successfully:', documentInfo);
          resolve(documentInfo);
        } catch (error) {
          console.error('âŒ Failed to parse document info:', error);
          console.error('XML data causing error:', data);
          reject(new Error('Failed to parse document info response: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('âŒ Document info request error:', error);
      reject(new Error('Network error while fetching document info: ' + error.message));
    });
    
    req.write(formattedPubNumber);
    req.end();
  });
}

function parseDocumentInstances(xmlData) {
  console.log('ðŸ” Parsing XML document instances...');
  
  // Enhanced regex to match document instances with all attributes
  const instances = [];
  const instanceRegex = /<ops:document-instance[^>]*>/g;
  
  let match;
  while ((match = instanceRegex.exec(xmlData)) !== null) {
    const instanceTag = match[0];
    console.log('Found instance tag:', instanceTag);
    
    // Extract attributes from the tag
    const descMatch = instanceTag.match(/desc="([^"]*)"/);
    const pagesMatch = instanceTag.match(/number-of-pages="([^"]*)"/);
    const linkMatch = instanceTag.match(/link="([^"]*)"/);
    
    if (descMatch && pagesMatch && linkMatch) {
      const instance = {
        desc: descMatch[1],
        numberOfPages: parseInt(pagesMatch[1]),
        link: linkMatch[1]
      };
      
      console.log('ðŸ“‹ Found instance:', {
        desc: instance.desc,
        pages: instance.numberOfPages,
        link: instance.link.substring(0, 50) + '...'
      });
      
      instances.push(instance);
    }
  }
  
  console.log('Total instances found:', instances.length);
  
  if (instances.length === 0) {
    console.error('âŒ No document instances found in XML');
    console.error('XML content sample:', xmlData.substring(0, 1000));
    throw new Error('No <ops:document-instance> elements found in XML response');
  }
  
  // Prefer FullDocument like in Python code, otherwise use first available
  let selectedInstance = instances.find(inst => inst.desc === 'FullDocument');
  
  if (selectedInstance) {
    console.log('âœ… Selected FullDocument instance with', selectedInstance.numberOfPages, 'pages');
  } else {
    selectedInstance = instances[0];
    console.log('âš ï¸ FullDocument not found, falling back to first instance:', selectedInstance.desc, 'with', selectedInstance.numberOfPages, 'pages');
  }
  
  return selectedInstance;
}

async function downloadEPODocument(documentInfo, downloadType, originalPubNumber, settings, accessToken) {
  try {
    console.log('ðŸ“ Setting up download for:', originalPubNumber);
    console.log('Document info:', documentInfo);
    console.log('Download type:', downloadType);
    
    const { downloadDirectory, filenameFormat, createSubfolders } = settings;
    console.log('Download settings:', { downloadDirectory, filenameFormat, createSubfolders });
    
    // Determine target directory
    let targetDir = downloadDirectory;
    if (createSubfolders) {
      const countryCode = originalPubNumber.substring(0, 2);
      targetDir = path.join(downloadDirectory, countryCode);
      console.log('Creating subfolder for country:', countryCode);
      
      // Create subdirectory if it doesn't exist
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
        console.log('Created directory:', targetDir);
      }
    }
    
    // Generate filename
    const filename = generateFilename(originalPubNumber, filenameFormat);
    const filePath = path.join(targetDir, filename);
    console.log('Target file path:', filePath);
    
    // Build the full image URL like in Python
    const fullImageUrl = `https://ops.epo.org/3.2/rest-services/${documentInfo.link}`;
    console.log('Full image URL:', fullImageUrl);
    console.log('Total pages to download:', documentInfo.numberOfPages);
    
    // Download pages based on type
    if (downloadType === 'frontpage') {
      console.log('ðŸ“„ Downloading front page only...');
      await downloadSinglePage(fullImageUrl, 1, filePath, accessToken);
    } else {
      console.log('ðŸ“š Downloading full document (' + documentInfo.numberOfPages + ' pages)...');
      await downloadAllPages(fullImageUrl, documentInfo.numberOfPages, filePath, accessToken);
    }
    
    console.log('âœ… Download completed successfully!');
    return { 
      success: true, 
      message: `Downloaded ${originalPubNumber} (${downloadType}) to ${filePath}`,
      filePath: filePath
    };
  } catch (error) {
    console.error('âŒ Download failed:', error);
    throw error;
  }
}

function generateFilename(publicationNumber, format) {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const cleanTitle = 'Patent_Document'; // Could be enhanced to include actual title
  
  switch (format) {
    case 'publication-number-date':
      return `${publicationNumber}_${timestamp}.pdf`;
    case 'publication-number-title':
      return `${publicationNumber}_${cleanTitle}.pdf`;
    default:
      return `${publicationNumber}.pdf`;
  }
}

async function downloadSinglePage(fullImageUrl, pageNumber, filePath, accessToken) {
  return new Promise((resolve, reject) => {
    console.log(`ðŸ“„ Downloading page ${pageNumber} from:`, fullImageUrl);
    
    const url = new URL(fullImageUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/pdf',
        'X-OPS-Range': pageNumber.toString()
      }
    };
    
    console.log('Request options:', options);
    
    const req = https.request(options, (res) => {
      console.log(`Page ${pageNumber} response status:`, res.statusCode);
      console.log(`Page ${pageNumber} response headers:`, res.headers);
      
      if (res.statusCode !== 200) {
        console.error(`âŒ Failed to download page ${pageNumber}: HTTP ${res.statusCode}`);
        reject(new Error(`Failed to download page ${pageNumber}: HTTP ${res.statusCode}`));
        return;
      }
      
      const writeStream = fs.createWriteStream(filePath);
      res.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log(`âœ… Page ${pageNumber} saved to:`, filePath);
        resolve();
      });
      
      writeStream.on('error', (error) => {
        console.error(`âŒ Error writing page ${pageNumber}:`, error);
        reject(error);
      });
    });
    
    req.on('error', (error) => {
      console.error(`âŒ Request error for page ${pageNumber}:`, error);
      reject(error);
    });
    
    req.end();
  });
}

async function downloadAllPages(fullImageUrl, numberOfPages, filePath, accessToken) {
  console.log(`ðŸ“š Downloading all ${numberOfPages} pages and merging into single PDF...`);
  
  // Configuration for parallel downloads
  const MAX_CONCURRENT_DOWNLOADS = Math.min(numberOfPages, 8); // Limit to 8 concurrent downloads
  console.log(`âš™ï¸ Using ${MAX_CONCURRENT_DOWNLOADS} concurrent downloads for ${numberOfPages} pages`);
  
  try {
    const tempDir = path.join(path.dirname(filePath), 'temp_' + Date.now());
    await fs.promises.mkdir(tempDir, { recursive: true });
    console.log('Created temp directory:', tempDir);
    
    // Parallel download with controlled concurrency
    console.log(`ðŸš€ Starting parallel download of ${numberOfPages} pages...`);
    
    const downloadPage = async (pageNum) => {
      const tempPageFile = path.join(tempDir, `page_${pageNum}.pdf`);
      try {
        const startTime = Date.now();
        console.log(`ðŸ“„ Starting download of page ${pageNum}/${numberOfPages}...`);
        await downloadSinglePage(fullImageUrl, pageNum, tempPageFile, accessToken);
        const duration = Date.now() - startTime;
        console.log(`âœ… Downloaded page ${pageNum}/${numberOfPages} in ${duration}ms`);
        return { pageNum, pageFile: tempPageFile, success: true };
      } catch (error) {
        console.error(`âŒ Failed to download page ${pageNum}:`, error.message);
        return { pageNum, pageFile: null, success: false, error: error.message };
      }
    };
    
    // Execute downloads in batches for controlled concurrency
    const downloadResults = [];
    const totalStartTime = Date.now();
    
    for (let i = 0; i < numberOfPages; i += MAX_CONCURRENT_DOWNLOADS) {
      const batch = [];
      const batchEnd = Math.min(i + MAX_CONCURRENT_DOWNLOADS, numberOfPages);
      
      console.log(`ðŸ”„ Processing batch: pages ${i + 1} to ${batchEnd}`);
      
      // Create batch of download promises
      for (let page = i + 1; page <= batchEnd; page++) {
        batch.push(downloadPage(page));
      }
      
      // Execute batch in parallel
      const batchResults = await Promise.allSettled(batch);
      downloadResults.push(...batchResults);
      
      console.log(`âœ… Completed batch: pages ${i + 1} to ${batchEnd}`);
    }
    
    const totalDownloadTime = Date.now() - totalStartTime;
    console.log(`â±ï¸ Total download time: ${totalDownloadTime}ms for ${numberOfPages} pages`);
    
    // Process results and collect successful downloads
    const pageFiles = [];
    let successCount = 0;
    let failCount = 0;
    
    downloadResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        pageFiles.push({ pageNum: result.value.pageNum, file: result.value.pageFile });
        successCount++;
      } else {
        failCount++;
        const pageNum = index + 1;
        const error = result.status === 'rejected' ? result.reason : result.value.error;
        console.error(`âŒ Page ${pageNum} failed:`, error);
      }
    });
    
    console.log(`ðŸ“Š Download summary: ${successCount} successful, ${failCount} failed out of ${numberOfPages} pages`);
    
    if (pageFiles.length === 0) {
      throw new Error('No pages were downloaded successfully');
    }
    
    // Sort pages by page number to ensure correct order in final PDF
    pageFiles.sort((a, b) => a.pageNum - b.pageNum);
    
    console.log(`ðŸ”„ Merging ${pageFiles.length} PDF pages into single document...`);
    
    // Create a new PDF document for merging
    const mergedPDF = await PDFDocument.create();
    
    // Add each page to the merged PDF in correct order
    for (let i = 0; i < pageFiles.length; i++) {
      const pageInfo = pageFiles[i];
      const pageFile = pageInfo.file;
      const pageNum = pageInfo.pageNum;
      
      console.log(`ðŸ“‹ Processing page ${pageNum} (${i + 1}/${pageFiles.length}): ${pageFile}`);
      
      try {
        // Read the individual PDF file
        const pdfBytes = await fs.promises.readFile(pageFile);
        console.log(`ðŸ“– Read ${pdfBytes.length} bytes from page ${pageNum}`);
        
        // Load the PDF document
        const pdf = await PDFDocument.load(pdfBytes);
        console.log(`ðŸ“„ Loaded PDF with ${pdf.getPageCount()} page(s)`);
        
        // Copy all pages from this PDF to the merged PDF
        const pageIndices = Array.from({ length: pdf.getPageCount() }, (_, i) => i);
        const copiedPages = await mergedPDF.copyPages(pdf, pageIndices);
        
        // Add the copied pages to the merged PDF
        copiedPages.forEach((page) => {
          mergedPDF.addPage(page);
        });
        
        console.log(`âœ… Added page ${pageNum} to merged PDF`);
        
      } catch (error) {
        console.error(`âŒ Failed to merge page ${pageNum}:`, error.message);
        // Continue with other pages
        continue;
      }
    }
    
    // Save the merged PDF
    console.log(`ðŸ’¾ Saving merged PDF to: ${filePath}`);
    const mergedPDFBytes = await mergedPDF.save();
    await fs.promises.writeFile(filePath, mergedPDFBytes);
    
    const finalPageCount = mergedPDF.getPageCount();
    console.log(`âœ… Successfully created merged PDF with ${finalPageCount} pages`);
    console.log(`ðŸ“ Final file size: ${mergedPDFBytes.length} bytes`);
    console.log(`ðŸ“„ Saved to: ${filePath}`);
    
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      console.log('ðŸ—‘ï¸ Cleaned up temporary files');
    } catch (cleanupError) {
      console.warn('âš ï¸ Failed to clean temp directory:', cleanupError.message);
    }
    
    console.log(`ðŸŽ‰ Full document download and merge completed successfully!`);
    
  } catch (error) {
    console.error('âŒ Error in downloadAllPages:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

// USPTO File Wrapper API Functions
async function fetchUsptoFileWrapperDocuments(applicationNumber, apiKey) {
  return new Promise((resolve, reject) => {
    const url = `https://api.uspto.gov/api/v1/patent/applications/${applicationNumber}/documents`;
    console.log('Fetching from USPTO API:', url);
    console.log('API Key length:', apiKey.length);
    console.log('API Key preview:', apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4));
    
    // Use exact header format that works in cURL
    const options = {
      hostname: 'api.uspto.gov',
      port: 443,
      path: `/api/v1/patent/applications/${applicationNumber}/documents`,
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'X-API-KEY': apiKey  // Uppercase as shown in working cURL example
      }
    };
    
    console.log('Request headers:', JSON.stringify(options.headers, null, 2));
    
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log('USPTO API response status:', res.statusCode);
      console.log('Response headers:', JSON.stringify(res.headers, null, 2));
      
      // Handle redirects (301, 302) as mentioned in USPTO docs
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        console.log('Following redirect to:', res.headers.location);
        const redirectUrl = new URL(res.headers.location);
        const redirectOptions = {
          hostname: redirectUrl.hostname,
          port: redirectUrl.port || 443,
          path: redirectUrl.pathname + redirectUrl.search,
          method: 'GET',
          headers: options.headers
        };
        
        const redirectReq = https.request(redirectOptions, (redirectRes) => {
          let redirectData = '';
          redirectRes.on('data', (chunk) => { redirectData += chunk; });
          redirectRes.on('end', () => {
            if (redirectRes.statusCode === 200) {
              try {
                const jsonData = JSON.parse(redirectData);
                console.log('âœ… USPTO API response received successfully (after redirect)');
                resolve(processUsptoResponse(jsonData));
              } catch (parseError) {
                reject(new Error('Failed to parse redirected response: ' + parseError.message));
              }
            } else {
              reject(new Error(`Redirect failed with status ${redirectRes.statusCode}`));
            }
          });
        });
        
        redirectReq.on('error', (error) => reject(error));
        redirectReq.end();
        return;
      }
      
      // Handle rate limiting (429) as shown in USPTO examples
      if (res.statusCode === 429) {
        console.log('âš ï¸ Rate limited (429), will retry after delay');
        setTimeout(() => {
          console.log('ðŸ”„ Retrying after rate limit delay...');
          fetchUsptoFileWrapperDocuments(applicationNumber, apiKey)
            .then(resolve)
            .catch(reject);
        }, 100); // 0.1 second delay as shown in examples
        return;
      }
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const jsonData = JSON.parse(data);
            console.log('âœ… USPTO API response received successfully');
            resolve(processUsptoResponse(jsonData));
          } else {
            console.error('USPTO API error:', res.statusCode);
            console.error('Response body:', data);
            
            let errorMessage = `HTTP ${res.statusCode}`;
            
            // Special handling for common errors
            if (res.statusCode === 403) {
              errorMessage = 'Access forbidden. Please verify your USPTO API key is valid and has proper permissions.';
            } else if (res.statusCode === 404) {
              errorMessage = 'Application not found. Please verify the application number is correct.';
            }
            
            try {
              const errorData = JSON.parse(data);
              if (errorData.message) {
                errorMessage += ` API Error: ${errorData.message}`;
              }
            } catch (e) {
              errorMessage += `: ${data || 'Unknown error'}`;
            }
            
            reject(new Error(errorMessage));
          }
        } catch (parseError) {
          console.error('âŒ Failed to parse USPTO API response:', parseError);
          console.error('Raw response data:', data);
          reject(new Error('Failed to parse API response: ' + parseError.message));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('âŒ USPTO API request error:', error);
      reject(new Error('Network error: ' + error.message));
    });
    
    req.setTimeout(30000, () => {
      console.error('âŒ USPTO API request timeout');
      req.destroy();
      reject(new Error('Request timeout - USPTO API did not respond within 30 seconds'));
    });
    
    req.end();
  });
}

async function downloadFileWrapperAsZip(documents, downloadDir) {
  console.log(`ðŸ“¦ Creating ZIP file with ${documents.length} documents...`);
  
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const zipFileName = `USPTO_FileWrapper_${timestamp}.zip`;
  const zipFilePath = path.join(downloadDir, zipFileName);
  
  try {
    // Download each document and add to ZIP
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(`ðŸ“„ Processing document ${i + 1}/${documents.length}: ${doc.documentCode || 'Unknown'}`);
      
      try {
        // Generate safe filename
        const docCode = doc.documentCode || 'DOC';
        const docId = doc.documentIdentifier || i;
        const safeFileName = `${docCode}-${docId}.pdf`.replace(/[^a-zA-Z0-9.-]/g, '_');
        
        // Download the document
        if (doc.downloadUrl) {
          const pdfBuffer = await downloadFileFromUrl(doc.downloadUrl);
          zip.file(safeFileName, pdfBuffer);
          console.log(`âœ… Added ${safeFileName} to ZIP`);
        } else {
          console.warn(`âš ï¸ No download URL for document: ${docCode}-${docId}`);
        }
      } catch (docError) {
        console.error(`âŒ Failed to process document ${i + 1}:`, docError.message);
        // Continue with other documents
      }
    }
    
    // Generate ZIP file
    console.log('ðŸ’¾ Generating ZIP file...');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Save ZIP file
    await fs.promises.writeFile(zipFilePath, zipBuffer);
    console.log(`âœ… ZIP file created: ${zipFilePath}`);
    console.log(`ðŸ“ File size: ${zipBuffer.length} bytes`);
    
    return zipFilePath;
    
  } catch (error) {
    console.error('âŒ Error creating ZIP file:', error);
    throw error;
  }
}

async function downloadFileWrapperAsMerged(documents, downloadDir) {
  console.log(`ðŸ“š Creating merged PDF with ${documents.length} documents...`);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const mergedFileName = `USPTO_FileWrapper_Merged_${timestamp}.pdf`;
  const mergedFilePath = path.join(downloadDir, mergedFileName);
  
  try {
    // Create new PDF document for merging
    const mergedPDF = await PDFDocument.create();
    
    // Download and merge each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(`ðŸ“„ Processing document ${i + 1}/${documents.length}: ${doc.documentCode || 'Unknown'}`);
      
      try {
        if (doc.downloadUrl) {
          // Download the PDF
          const pdfBuffer = await downloadFileFromUrl(doc.downloadUrl);
          
          // Load the PDF and copy pages
          const pdf = await PDFDocument.load(pdfBuffer);
          const pageIndices = Array.from({ length: pdf.getPageCount() }, (_, i) => i);
          const copiedPages = await mergedPDF.copyPages(pdf, pageIndices);
          
          // Add pages to merged PDF
          copiedPages.forEach(page => mergedPDF.addPage(page));
          
          console.log(`âœ… Added ${pdf.getPageCount()} pages from document ${i + 1}`);
        } else {
          console.warn(`âš ï¸ No download URL for document: ${doc.documentCode || 'Unknown'}`);
        }
      } catch (docError) {
        console.error(`âŒ Failed to process document ${i + 1}:`, docError.message);
        // Continue with other documents
      }
    }
    
    // Save merged PDF
    console.log('ðŸ’¾ Saving merged PDF...');
    const mergedPDFBytes = await mergedPDF.save();
    await fs.promises.writeFile(mergedFilePath, mergedPDFBytes);
    
    console.log(`âœ… Merged PDF created: ${mergedFilePath}`);
    console.log(`ðŸ“ File size: ${mergedPDFBytes.length} bytes`);
    console.log(`ðŸ“„ Total pages: ${mergedPDF.getPageCount()}`);
    
    return mergedFilePath;
    
  } catch (error) {
    console.error('âŒ Error creating merged PDF:', error);
    throw error;
  }
}

async function downloadFileFromUrl(url) {
  return new Promise((resolve, reject) => {
    console.log('Downloading file from:', url.substring(0, 50) + '...');
    
    const request = url.startsWith('https:') ? https : http;
    
    const req = request.get(url, (res) => {
      console.log('Download response status:', res.statusCode);
      
      if (res.statusCode === 200) {
        const chunks = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          console.log(`âœ… Downloaded ${buffer.length} bytes`);
          resolve(buffer);
        });
      } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirect
        console.log('Following redirect to:', res.headers.location);
        downloadFileFromUrl(res.headers.location)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`HTTP ${res.statusCode}: Failed to download file`));
      }
    });
    
    req.on('error', (error) => {
      console.error('âŒ Download error:', error);
      reject(error);
    });
    
    req.setTimeout(30000, () => {
      console.error('âŒ Download timeout');
      req.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

// USPTO File Wrapper Helper Functions

async function downloadFileWrapperAsZip(documents, downloadDir, usptoApiKey, event = null) {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const zipFileName = `USPTO_FileWrapper_${timestamp}.zip`;
  const zipFilePath = path.join(downloadDir, zipFileName);
  
  console.log(`Creating ZIP file with ${documents.length} documents...`);
  
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`Downloading document ${i + 1}/${documents.length}: ${doc.documentCode || 'Unknown'}`);
    
    try {
      // Download the PDF from USPTO with API key
      const pdfBuffer = await downloadUsptoDocument(doc.downloadUrl, usptoApiKey);
      
      // Create a safe filename
      const fileName = `${doc.documentCode || 'doc'}-${doc.documentIdentifier || i}.pdf`;
      const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
      
      // Add to ZIP
      zip.file(safeFileName, pdfBuffer);
      
      console.log(`âœ… Added ${safeFileName} to ZIP`);
    } catch (error) {
      console.error(`âŒ Failed to download document ${doc.documentCode}:`, error.message);
      // Continue with other documents
    }
  }
  
  // Generate ZIP file
  console.log('Generating ZIP file...');
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  
  // Save ZIP file
  await fs.promises.writeFile(zipFilePath, zipBuffer);
  
  console.log(`âœ… ZIP file created: ${zipFilePath}`);
  console.log(`ðŸ“ File size: ${zipBuffer.length} bytes`);
  
  return zipFilePath;
}

async function downloadFileWrapperAsMerged(documents, downloadDir, usptoApiKey, event = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const mergedFileName = `USPTO_FileWrapper_Merged_${timestamp}.pdf`;
  const mergedFilePath = path.join(downloadDir, mergedFileName);
  
  console.log(`Creating merged PDF with ${documents.length} documents...`);
  
  // Create new PDF document for merging
  const mergedPDF = await PDFDocument.create();
  
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`Processing document ${i + 1}/${documents.length}: ${doc.documentCode || 'Unknown'}`);
    
    try {
      // Download the PDF from USPTO with API key
      const pdfBuffer = await downloadUsptoDocument(doc.downloadUrl, usptoApiKey);
      
      // Load the PDF document
      const pdf = await PDFDocument.load(pdfBuffer);
      console.log(`ðŸ“„ Loaded PDF with ${pdf.getPageCount()} page(s)`);
      
      // Copy all pages from this PDF to the merged PDF
      const pageIndices = Array.from({ length: pdf.getPageCount() }, (_, i) => i);
      const copiedPages = await mergedPDF.copyPages(pdf, pageIndices);
      
      // Add the copied pages to the merged PDF
      copiedPages.forEach((page) => {
        mergedPDF.addPage(page);
      });
      
      console.log(`âœ… Added ${pdf.getPageCount()} pages from ${doc.documentCode}`);
      
    } catch (error) {
      console.error(`âŒ Failed to merge document ${doc.documentCode}:`, error.message);
      // Continue with other documents
    }
  }
  
  // Save the merged PDF
  const mergedPDFBytes = await mergedPDF.save();
  await fs.promises.writeFile(mergedFilePath, mergedPDFBytes);
  
  const finalPageCount = mergedPDF.getPageCount();
  console.log(`âœ… Merged PDF created with ${finalPageCount} pages`);
  console.log(`ðŸ“ File size: ${mergedPDFBytes.length} bytes`);
  console.log(`ðŸ“„ Saved to: ${mergedFilePath}`);
  
  return mergedFilePath;
}

async function downloadUsptoDocument(downloadUrl, usptoApiKey) {
  return new Promise((resolve, reject) => {
    console.log('Downloading from URL:', downloadUrl);
    console.log('Using API key for download:', usptoApiKey.substring(0, 8) + '...');
    
    const url = new URL(downloadUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'accept': 'application/pdf',
        'X-API-KEY': usptoApiKey
      }
    };
    
    const req = https.request(options, (res) => {
      console.log(`Download response status: ${res.statusCode}`);
      
      // Handle redirects (302/301)
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        console.log('Following redirect to:', redirectUrl);
        
        if (!redirectUrl) {
          reject(new Error('Redirect response missing location header'));
          return;
        }
        
        // Follow the redirect (usually to data-documents.uspto.gov domain)
        // Note: The redirect URL typically doesn't need API key authentication
        const redirectUrlObj = new URL(redirectUrl);
        const redirectOptions = {
          hostname: redirectUrlObj.hostname,
          port: redirectUrlObj.port || 443,
          path: redirectUrlObj.pathname + redirectUrlObj.search,
          method: 'GET',
          headers: {
            'accept': 'application/pdf'
            // Don't include X-API-KEY for redirect domain
          }
        };
        
        console.log('Making redirect request to:', redirectUrl);
        const redirectReq = https.request(redirectOptions, (redirectRes) => {
          console.log(`Redirect response status: ${redirectRes.statusCode}`);
          
          if (redirectRes.statusCode === 200) {
            const chunks = [];
            
            redirectRes.on('data', (chunk) => {
              chunks.push(chunk);
            });
            
            redirectRes.on('end', () => {
              const buffer = Buffer.concat(chunks);
              console.log(`âœ… Downloaded ${buffer.length} bytes via redirect`);
              resolve(buffer);
            });
          } else {
            console.error('Redirect download failed with status:', redirectRes.statusCode);
            console.error('Redirect response headers:', redirectRes.headers);
            reject(new Error(`Failed to download from redirect: HTTP ${redirectRes.statusCode}`));
          }
        });
        
        redirectReq.on('error', (error) => {
          console.error('Redirect request error:', error);
          reject(new Error('Network error on redirect: ' + error.message));
        });
        
        redirectReq.end();
        return;
      }
      
      if (res.statusCode === 200) {
        const chunks = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          console.log(`Downloaded ${buffer.length} bytes`);
          resolve(buffer);
        });
      } else {
        console.error('Download failed with status:', res.statusCode);
        console.error('Response headers:', res.headers);
        reject(new Error(`Failed to download document: HTTP ${res.statusCode}`));
      }
    });
    
    req.on('error', (error) => {
      console.error('Download request error:', error);
      reject(new Error('Network error while downloading document: ' + error.message));
    });
    
    req.end();
  });
}

function processUsptoResponse(jsonData) {
  console.log('Raw API response:', JSON.stringify(jsonData, null, 2));
  
  // Extract documents from documentBag array
  const documentBag = jsonData.documentBag || [];
  console.log(`Found ${documentBag.length} documents in documentBag`);
  
  // Transform USPTO response to our expected format
  const documents = documentBag.map(doc => {
    // Get the first PDF download option
    const pdfOption = doc.downloadOptionBag?.find(opt => opt.mimeTypeIdentifier === 'PDF');
    
    return {
      documentCode: doc.documentCode,
      documentIdentifier: doc.documentIdentifier,
      documentDescription: doc.documentCodeDescriptionText,
      documentCodeDescriptionText: doc.documentCodeDescriptionText,
      officialDate: doc.officialDate,
      directionCategory: doc.directionCategory,
      downloadUrl: pdfOption?.downloadUrl,
      pageTotalQuantity: pdfOption?.pageTotalQuantity || 1,
      applicationNumberText: doc.applicationNumberText
    };
  });
  
  console.log(`Processed ${documents.length} documents for download`);
  return documents;
}

// Parallel processing versions of file wrapper download functions
async function downloadFileWrapperAsZipParallel(documents, downloadDir, usptoApiKey, event = null) {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const zipFileName = `USPTO_FileWrapper_${timestamp}.zip`;
  const zipFilePath = path.join(downloadDir, zipFileName);
  
  console.log(`Creating ZIP file with ${documents.length} documents...`);
  
  // Send initial progress update
  if (event) {
    event.sender.send('file-wrapper-progress', { 
      completed: 0, 
      total: documents.length, 
      status: 'downloading' 
    });
  }
  
  // Create download promises with controlled concurrency (limit to 5 concurrent downloads)
  const maxConcurrency = 5;
  let completed = 0;
  
  // Process documents in batches
  for (let i = 0; i < documents.length; i += maxConcurrency) {
    const batch = documents.slice(i, i + maxConcurrency);
    
    // Create promises for this batch
    const downloadPromises = batch.map(async (doc, batchIndex) => {
      const docIndex = i + batchIndex;
      try {
        console.log(`Downloading document ${docIndex + 1}/${documents.length}: ${doc.documentCode || 'Unknown'}`);
        
        // Download the PDF from USPTO with API key
        const pdfBuffer = await downloadUsptoDocument(doc.downloadUrl, usptoApiKey);
        
        // Create a safe filename
        const fileName = `${doc.documentCode || 'doc'}-${doc.documentIdentifier || docIndex}.pdf`;
        const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
        
        console.log(`Downloaded ${safeFileName}`);
        return { success: true, fileName: safeFileName, buffer: pdfBuffer };
      } catch (error) {
        console.error(`Failed to download document ${doc.documentCode}:`, error.message);
        return { success: false, fileName: `${doc.documentCode || 'doc'}-${doc.documentIdentifier || docIndex}.pdf`, error: error.message };
      }
    });
    
    // Wait for this batch to complete
    const results = await Promise.allSettled(downloadPromises);
    
    // Process results and add successful downloads to ZIP
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        zip.file(result.value.fileName, result.value.buffer);
      }
      completed++;
      
      // Send progress update
      if (event) {
        event.sender.send('file-wrapper-progress', { 
          completed, 
          total: documents.length, 
          status: 'downloading' 
        });
      }
    });
  }
  
  // Send creating ZIP progress update
  if (event) {
    event.sender.send('file-wrapper-progress', { 
      completed: documents.length, 
      total: documents.length, 
      status: 'creating-zip' 
    });
  }
  
  // Generate ZIP file
  console.log('Generating ZIP file...');
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  
  // Save ZIP file
  await fs.promises.writeFile(zipFilePath, zipBuffer);
  
  console.log(`ZIP file created: ${zipFilePath}`);
  console.log(`File size: ${zipBuffer.length} bytes`);
  
  return zipFilePath;
}

async function downloadFileWrapperAsMergedParallel(documents, downloadDir, usptoApiKey, event = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const mergedFileName = `USPTO_FileWrapper_Merged_${timestamp}.pdf`;
  const mergedFilePath = path.join(downloadDir, mergedFileName);
  
  console.log(`Creating merged PDF with ${documents.length} documents...`);
  
  // Send initial progress update
  if (event) {
    event.sender.send('file-wrapper-progress', { 
      completed: 0, 
      total: documents.length, 
      status: 'downloading' 
    });
  }
  
  // Create new PDF document for merging
  const mergedPDF = await PDFDocument.create();
  
  // Create download promises with controlled concurrency (limit to 5 concurrent downloads)
  const maxConcurrency = 5;
  let completed = 0;
  const downloadedPdfs = new Array(documents.length); // Maintain order
  
  // Process documents in batches
  for (let i = 0; i < documents.length; i += maxConcurrency) {
    const batch = documents.slice(i, i + maxConcurrency);
    
    // Create promises for this batch
    const downloadPromises = batch.map(async (doc, batchIndex) => {
      const docIndex = i + batchIndex;
      try {
        console.log(`Processing document ${docIndex + 1}/${documents.length}: ${doc.documentCode || 'Unknown'}`);
        
        // Download the PDF from USPTO with API key
        const pdfBuffer = await downloadUsptoDocument(doc.downloadUrl, usptoApiKey);
        
        // Load the PDF document
        const pdf = await PDFDocument.load(pdfBuffer);
        console.log(`Loaded PDF with ${pdf.getPageCount()} page(s)`);
        
        return { success: true, pdf, docIndex, documentCode: doc.documentCode || 'Unknown' };
      } catch (error) {
        console.error(`Failed to download document ${doc.documentCode}:`, error.message);
        return { success: false, docIndex, error: error.message };
      }
    });
    
    // Wait for this batch to complete
    const results = await Promise.allSettled(downloadPromises);
    
    // Store results in order
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        downloadedPdfs[result.value.docIndex] = result.value;
      }
      completed++;
      
      // Send progress update
      if (event) {
        event.sender.send('file-wrapper-progress', { 
          completed, 
          total: documents.length, 
          status: 'downloading' 
        });
      }
    });
  }
  
  // Send merging progress update
  if (event) {
    event.sender.send('file-wrapper-progress', { 
      completed: documents.length, 
      total: documents.length, 
      status: 'merging' 
    });
  }
  
  // Merge PDFs in order
  for (let i = 0; i < downloadedPdfs.length; i++) {
    const pdfData = downloadedPdfs[i];
    if (pdfData && pdfData.success) {
      try {
        // Copy all pages from this PDF to the merged PDF
        const pageIndices = Array.from({ length: pdfData.pdf.getPageCount() }, (_, j) => j);
        const copiedPages = await mergedPDF.copyPages(pdfData.pdf, pageIndices);
        
        // Add the copied pages to the merged PDF
        copiedPages.forEach((page) => {
          mergedPDF.addPage(page);
        });
        
        console.log(`Added ${pdfData.pdf.getPageCount()} pages from ${pdfData.documentCode}`);
      } catch (error) {
        console.error(`Failed to merge document ${pdfData.documentCode}:`, error.message);
      }
    }
  }
  
  // Save the merged PDF
  console.log('Saving merged PDF...');
  const pdfBytes = await mergedPDF.save();
  await fs.promises.writeFile(mergedFilePath, pdfBytes);
  
  console.log(`Merged PDF created with ${mergedPDF.getPageCount()} pages`);
  console.log(`File size: ${pdfBytes.length} bytes`);
  console.log(`Saved to: ${mergedFilePath}`);
  
  return mergedFilePath;
}

