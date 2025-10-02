const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { PDFDocument } = require('pdf-lib');

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
    console.log('💾 Saving download settings to:', downloadSettingsPath);
    console.log('Settings to save:', JSON.stringify(settings, null, 2));
    
    await fs.promises.writeFile(downloadSettingsPath, JSON.stringify(settings, null, 2));
    console.log('✅ Download settings file written successfully');
    
    // Verify the file was written
    if (fs.existsSync(downloadSettingsPath)) {
      const verification = await fs.promises.readFile(downloadSettingsPath, 'utf8');
      console.log('✅ Verification - file content:', verification);
    }
    
    return { success: true, message: 'Download settings saved successfully' };
  } catch (error) {
    console.error('❌ Error saving download settings:', error);
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
      console.error('❌ Failed to load download settings:', downloadSettingsResult.message);
      return { success: false, message: 'Failed to load download settings: ' + downloadSettingsResult.message };
    }
    
    if (!apiKeysResult.success) {
      console.error('❌ Failed to load API keys:', apiKeysResult.message);
      return { success: false, message: 'Failed to load API keys: ' + apiKeysResult.message };
    }
    
    const settings = downloadSettingsResult.data;
    const apiKeys = apiKeysResult.data;
    
    console.log('Loaded settings:', settings);
    console.log('Download directory from settings:', settings.downloadDirectory);
    
    if (!settings.downloadDirectory) {
      console.error('❌ Download directory not configured in settings');
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
      console.error('❌ File does not exist:', filePath);
      return { success: false, message: 'File does not exist' };
    }
    
    // Import shell dynamically since it's not available at module level
    const { shell } = require('electron');
    
    // Show the file in the default file manager (Windows Explorer, Finder, etc.)
    await shell.showItemInFolder(filePath);
    
    console.log('✅ Successfully opened file location for:', filePath);
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error opening file location:', error);
    return { success: false, message: 'Failed to open file location: ' + error.message };
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
    console.error('❌ Error loading download settings:', error);
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
    console.error('❌ EPO download error for', publicationNumber, ':', error);
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
    console.log('🔐 Requesting new EPO access token...');
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
            console.error('❌ Failed to get access token. Status:', res.statusCode);
            reject(new Error(`Failed to get access token: HTTP ${res.statusCode} - ${data}`));
            return;
          }
          
          const response = JSON.parse(data);
          console.log('Parsed token response:', response);
          
          if (response.access_token) {
            console.log('✅ Access token received:', response.access_token.substring(0, 20) + '...');
            resolve(response.access_token);
          } else {
            reject(new Error('No access token in response: ' + JSON.stringify(response)));
          }
        } catch (error) {
          console.error('❌ Failed to parse token response:', error);
          reject(new Error('Failed to parse access token response: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
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
    console.log('📄 Fetching document information for:', formattedPubNumber);
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
            console.error('❌ Failed to get document info. Status:', res.statusCode);
            console.error('Response body:', data);
            reject(new Error(`Failed to get document info: HTTP ${res.statusCode} - ${data}`));
            return;
          }
          
          // Parse XML to get document instances
          const documentInfo = parseDocumentInstances(data);
          console.log('✅ Document instances parsed successfully:', documentInfo);
          resolve(documentInfo);
        } catch (error) {
          console.error('❌ Failed to parse document info:', error);
          console.error('XML data causing error:', data);
          reject(new Error('Failed to parse document info response: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Document info request error:', error);
      reject(new Error('Network error while fetching document info: ' + error.message));
    });
    
    req.write(formattedPubNumber);
    req.end();
  });
}

function parseDocumentInstances(xmlData) {
  console.log('🔍 Parsing XML document instances...');
  
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
      
      console.log('📋 Found instance:', {
        desc: instance.desc,
        pages: instance.numberOfPages,
        link: instance.link.substring(0, 50) + '...'
      });
      
      instances.push(instance);
    }
  }
  
  console.log('Total instances found:', instances.length);
  
  if (instances.length === 0) {
    console.error('❌ No document instances found in XML');
    console.error('XML content sample:', xmlData.substring(0, 1000));
    throw new Error('No <ops:document-instance> elements found in XML response');
  }
  
  // Prefer FullDocument like in Python code, otherwise use first available
  let selectedInstance = instances.find(inst => inst.desc === 'FullDocument');
  
  if (selectedInstance) {
    console.log('✅ Selected FullDocument instance with', selectedInstance.numberOfPages, 'pages');
  } else {
    selectedInstance = instances[0];
    console.log('⚠️ FullDocument not found, falling back to first instance:', selectedInstance.desc, 'with', selectedInstance.numberOfPages, 'pages');
  }
  
  return selectedInstance;
}

async function downloadEPODocument(documentInfo, downloadType, originalPubNumber, settings, accessToken) {
  try {
    console.log('📁 Setting up download for:', originalPubNumber);
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
      console.log('📄 Downloading front page only...');
      await downloadSinglePage(fullImageUrl, 1, filePath, accessToken);
    } else {
      console.log('📚 Downloading full document (' + documentInfo.numberOfPages + ' pages)...');
      await downloadAllPages(fullImageUrl, documentInfo.numberOfPages, filePath, accessToken);
    }
    
    console.log('✅ Download completed successfully!');
    return { 
      success: true, 
      message: `Downloaded ${originalPubNumber} (${downloadType}) to ${filePath}`,
      filePath: filePath
    };
  } catch (error) {
    console.error('❌ Download failed:', error);
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
    console.log(`📄 Downloading page ${pageNumber} from:`, fullImageUrl);
    
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
        console.error(`❌ Failed to download page ${pageNumber}: HTTP ${res.statusCode}`);
        reject(new Error(`Failed to download page ${pageNumber}: HTTP ${res.statusCode}`));
        return;
      }
      
      const writeStream = fs.createWriteStream(filePath);
      res.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log(`✅ Page ${pageNumber} saved to:`, filePath);
        resolve();
      });
      
      writeStream.on('error', (error) => {
        console.error(`❌ Error writing page ${pageNumber}:`, error);
        reject(error);
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ Request error for page ${pageNumber}:`, error);
      reject(error);
    });
    
    req.end();
  });
}

async function downloadAllPages(fullImageUrl, numberOfPages, filePath, accessToken) {
  console.log(`📚 Downloading all ${numberOfPages} pages and merging into single PDF...`);
  
  // Configuration for parallel downloads
  const MAX_CONCURRENT_DOWNLOADS = Math.min(numberOfPages, 8); // Limit to 8 concurrent downloads
  console.log(`⚙️ Using ${MAX_CONCURRENT_DOWNLOADS} concurrent downloads for ${numberOfPages} pages`);
  
  try {
    const tempDir = path.join(path.dirname(filePath), 'temp_' + Date.now());
    await fs.promises.mkdir(tempDir, { recursive: true });
    console.log('Created temp directory:', tempDir);
    
    // Parallel download with controlled concurrency
    console.log(`🚀 Starting parallel download of ${numberOfPages} pages...`);
    
    const downloadPage = async (pageNum) => {
      const tempPageFile = path.join(tempDir, `page_${pageNum}.pdf`);
      try {
        const startTime = Date.now();
        console.log(`📄 Starting download of page ${pageNum}/${numberOfPages}...`);
        await downloadSinglePage(fullImageUrl, pageNum, tempPageFile, accessToken);
        const duration = Date.now() - startTime;
        console.log(`✅ Downloaded page ${pageNum}/${numberOfPages} in ${duration}ms`);
        return { pageNum, pageFile: tempPageFile, success: true };
      } catch (error) {
        console.error(`❌ Failed to download page ${pageNum}:`, error.message);
        return { pageNum, pageFile: null, success: false, error: error.message };
      }
    };
    
    // Execute downloads in batches for controlled concurrency
    const downloadResults = [];
    const totalStartTime = Date.now();
    
    for (let i = 0; i < numberOfPages; i += MAX_CONCURRENT_DOWNLOADS) {
      const batch = [];
      const batchEnd = Math.min(i + MAX_CONCURRENT_DOWNLOADS, numberOfPages);
      
      console.log(`🔄 Processing batch: pages ${i + 1} to ${batchEnd}`);
      
      // Create batch of download promises
      for (let page = i + 1; page <= batchEnd; page++) {
        batch.push(downloadPage(page));
      }
      
      // Execute batch in parallel
      const batchResults = await Promise.allSettled(batch);
      downloadResults.push(...batchResults);
      
      console.log(`✅ Completed batch: pages ${i + 1} to ${batchEnd}`);
    }
    
    const totalDownloadTime = Date.now() - totalStartTime;
    console.log(`⏱️ Total download time: ${totalDownloadTime}ms for ${numberOfPages} pages`);
    
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
        console.error(`❌ Page ${pageNum} failed:`, error);
      }
    });
    
    console.log(`📊 Download summary: ${successCount} successful, ${failCount} failed out of ${numberOfPages} pages`);
    
    if (pageFiles.length === 0) {
      throw new Error('No pages were downloaded successfully');
    }
    
    // Sort pages by page number to ensure correct order in final PDF
    pageFiles.sort((a, b) => a.pageNum - b.pageNum);
    
    console.log(`🔄 Merging ${pageFiles.length} PDF pages into single document...`);
    
    // Create a new PDF document for merging
    const mergedPDF = await PDFDocument.create();
    
    // Add each page to the merged PDF in correct order
    for (let i = 0; i < pageFiles.length; i++) {
      const pageInfo = pageFiles[i];
      const pageFile = pageInfo.file;
      const pageNum = pageInfo.pageNum;
      
      console.log(`📋 Processing page ${pageNum} (${i + 1}/${pageFiles.length}): ${pageFile}`);
      
      try {
        // Read the individual PDF file
        const pdfBytes = await fs.promises.readFile(pageFile);
        console.log(`📖 Read ${pdfBytes.length} bytes from page ${pageNum}`);
        
        // Load the PDF document
        const pdf = await PDFDocument.load(pdfBytes);
        console.log(`📄 Loaded PDF with ${pdf.getPageCount()} page(s)`);
        
        // Copy all pages from this PDF to the merged PDF
        const pageIndices = Array.from({ length: pdf.getPageCount() }, (_, i) => i);
        const copiedPages = await mergedPDF.copyPages(pdf, pageIndices);
        
        // Add the copied pages to the merged PDF
        copiedPages.forEach((page) => {
          mergedPDF.addPage(page);
        });
        
        console.log(`✅ Added page ${pageNum} to merged PDF`);
        
      } catch (error) {
        console.error(`❌ Failed to merge page ${pageNum}:`, error.message);
        // Continue with other pages
        continue;
      }
    }
    
    // Save the merged PDF
    console.log(`💾 Saving merged PDF to: ${filePath}`);
    const mergedPDFBytes = await mergedPDF.save();
    await fs.promises.writeFile(filePath, mergedPDFBytes);
    
    const finalPageCount = mergedPDF.getPageCount();
    console.log(`✅ Successfully created merged PDF with ${finalPageCount} pages`);
    console.log(`📁 Final file size: ${mergedPDFBytes.length} bytes`);
    console.log(`📄 Saved to: ${filePath}`);
    
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      console.log('🗑️ Cleaned up temporary files');
    } catch (cleanupError) {
      console.warn('⚠️ Failed to clean temp directory:', cleanupError.message);
    }
    
    console.log(`🎉 Full document download and merge completed successfully!`);
    
  } catch (error) {
    console.error('❌ Error in downloadAllPages:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}
