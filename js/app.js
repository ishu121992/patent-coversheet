/**
 * Main application JavaScript file
 * Handles navigation, view loading, and app initialization
 */

class PatentApp {
    constructor() {
        this.currentView = null;
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.contentTitle = document.getElementById('content-title');
        this.contentBody = document.getElementById('content-body');
        
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupProgressListeners();
        this.loadDefaultView();
    }
    
    setupProgressListeners() {
        // Listen for file wrapper download progress updates
        if (window.electronAPI && window.electronAPI.onFileWrapperProgress) {
            window.electronAPI.onFileWrapperProgress((progressData) => {
                this.updateFileWrapperProgress(
                    progressData.completed, 
                    progressData.total, 
                    progressData.status, 
                    progressData.filePath
                );
            });
        }
    }

    setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-button');
        
        navButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const viewName = e.currentTarget.getAttribute('data-view');
                this.loadView(viewName);
                this.setActiveButton(e.currentTarget);
            });
        });
    }

    setActiveButton(activeButton) {
        // Remove active class from all buttons
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add active class to clicked button
        activeButton.classList.add('active');
    }

    async loadView(viewName) {
        try {
            this.showLoading();
            
            const result = await window.electronAPI.loadView(viewName);
            
            if (result.success) {
                this.contentBody.innerHTML = result.content;
                this.updateTitle(viewName);
                this.currentView = viewName;
                
                // Initialize view-specific functionality
                this.initializeViewFunctionality(viewName);
                
                // Send message to view that it's loaded
                setTimeout(() => {
                    window.postMessage({ type: 'view-loaded', view: viewName }, '*');
                }, 100);
            } else {
                this.showError('Failed to load view: ' + result.message);
            }
        } catch (error) {
            console.error('Error loading view:', error);
            this.showError('An error occurred while loading the view.');
        } finally {
            this.hideLoading();
        }
    }

    initializeViewFunctionality(viewName) {
        switch (viewName) {
            case 'settings':
                this.initializeSettingsView();
                break;
            case 'download-publications':
                this.initializeDownloadView();
                break;
            case 'file-wrapper-download':
                this.initializeFileWrapperView();
                break;
            case 'generate-coversheet':
                this.initializeCoversheetView();
                break;
        }
    }

    async initializeSettingsView() {
        try {
            // Load existing API keys
            const result = await window.electronAPI.loadApiKeys();
            
            if (result.success) {
                const data = result.data;
                
                // Populate form fields if they exist
                const usptoInput = document.getElementById('uspto-api-key');
                const espacenetConsumerInput = document.getElementById('espacenet-consumer-key');
                const espacenetSecretInput = document.getElementById('espacenet-secret-key');
                
                if (usptoInput) usptoInput.value = data.usptoApiKey || '';
                if (espacenetConsumerInput) espacenetConsumerInput.value = data.espacenetConsumerKey || '';
                if (espacenetSecretInput) espacenetSecretInput.value = data.espacenetSecretKey || '';
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
        }

        // Setup save button event listener
        const saveButton = document.getElementById('save-settings');
        if (saveButton) {
            saveButton.addEventListener('click', () => this.saveSettings());
        }

        // Update platform information
        if (window.electronAPI) {
            const platformInfo = document.getElementById('platform-info');
            const electronVersion = document.getElementById('electron-version');
            if (platformInfo) platformInfo.textContent = window.electronAPI.platform;
            if (electronVersion) electronVersion.textContent = window.electronAPI.versions.electron;
        }

        // Setup download settings functionality
        this.initializeDownloadSettings();
        
        console.log('Settings view initialized with API keys and download settings');
    }
    
    async initializeDownloadSettings() {
        // Browse directory functionality
        const browseButton = document.getElementById('browse-directory');
        if (browseButton) {
            browseButton.addEventListener('click', async () => {
                console.log('Browse directory clicked');
                
                if (!window.electronAPI || !window.electronAPI.selectDownloadDirectory) {
                    console.error('electronAPI not available');
                    this.showAlert('Directory selection not available. Please ensure the app is properly loaded.', 'error');
                    return;
                }
                
                try {
                    console.log('Calling selectDownloadDirectory...');
                    const result = await window.electronAPI.selectDownloadDirectory();
                    console.log('Directory selection result:', result);
                    
                    if (result.success && result.directoryPath) {
                        const directoryInput = document.getElementById('download-directory');
                        if (directoryInput) {
                            directoryInput.value = result.directoryPath;
                            console.log('Directory set to:', result.directoryPath);
                            
                            // Auto-save the directory setting when selected
                            await this.autoSaveDownloadDirectory(result.directoryPath);
                        }
                    } else {
                        console.log('Directory selection cancelled or failed');
                        if (result.message) {
                            this.showAlert('Failed to select directory: ' + result.message, 'error');
                        }
                    }
                } catch (error) {
                    console.error('Error selecting directory:', error);
                    this.showAlert('Failed to open directory selector: ' + error.message, 'error');
                }
            });
        }

        // Save download settings
        const saveDownloadButton = document.getElementById('save-download-settings');
        if (saveDownloadButton) {
            saveDownloadButton.addEventListener('click', async () => {
                try {
                    const downloadDirectory = document.getElementById('download-directory')?.value;
                    const filenameFormat = document.getElementById('filename-format')?.value;
                    const createSubfolders = document.getElementById('create-subfolders')?.checked;

                    if (!downloadDirectory) {
                        this.showAlert('Please select a download directory first.', 'error');
                        return;
                    }

                    const downloadSettings = {
                        downloadDirectory,
                        filenameFormat: filenameFormat || 'publication-number',
                        createSubfolders: createSubfolders || false
                    };

                    if (!window.electronAPI || !window.electronAPI.saveDownloadSettings) {
                        this.showAlert('Save functionality not available.', 'error');
                        return;
                    }

                    const result = await window.electronAPI.saveDownloadSettings(downloadSettings);
                    
                    if (result.success) {
                        this.showAlert('Download settings saved successfully!', 'success');
                    } else {
                        this.showAlert('Failed to save download settings: ' + result.message, 'error');
                    }
                } catch (error) {
                    console.error('Error saving download settings:', error);
                    this.showAlert('An error occurred while saving download settings.', 'error');
                }
            });
        }

        // Setup other settings buttons
        const testConnectionButton = document.getElementById('test-connection');
        if (testConnectionButton) {
            testConnectionButton.addEventListener('click', () => {
                this.showAlert('Connection testing functionality will be implemented here.', 'info');
            });
        }

        const clearCacheButton = document.getElementById('clear-cache');
        if (clearCacheButton) {
            clearCacheButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the application cache?')) {
                    this.showAlert('Cache clearing functionality will be implemented here.', 'info');
                }
            });
        }

        const exportSettingsButton = document.getElementById('export-settings');
        if (exportSettingsButton) {
            exportSettingsButton.addEventListener('click', () => {
                this.showAlert('Settings export functionality will be implemented here.', 'info');
            });
        }

        // Load existing download settings
        await this.loadDownloadSettings();
    }

    async loadDownloadSettings() {
        try {
            if (!window.electronAPI || !window.electronAPI.loadDownloadSettings) {
                return;
            }
            
            const result = await window.electronAPI.loadDownloadSettings();
            
            if (result.success && result.data) {
                const data = result.data;
                
                const directoryInput = document.getElementById('download-directory');
                const filenameSelect = document.getElementById('filename-format');
                const subfoldersCheckbox = document.getElementById('create-subfolders');
                
                if (data.downloadDirectory && directoryInput) {
                    directoryInput.value = data.downloadDirectory;
                }
                if (data.filenameFormat && filenameSelect) {
                    filenameSelect.value = data.filenameFormat;
                }
                if (data.createSubfolders !== undefined && subfoldersCheckbox) {
                    subfoldersCheckbox.checked = data.createSubfolders;
                }
            }
        } catch (error) {
            console.error('Error loading download settings:', error);
        }
    }
    
    async autoSaveDownloadDirectory(directoryPath) {
        try {
            console.log('Auto-saving download directory:', directoryPath);
            
            // Load existing settings first
            let existingSettings = {};
            if (window.electronAPI && window.electronAPI.loadDownloadSettings) {
                const loadResult = await window.electronAPI.loadDownloadSettings();
                if (loadResult.success && loadResult.data) {
                    existingSettings = loadResult.data;
                }
            }
            
            // Update with new directory
            const downloadSettings = {
                downloadDirectory: directoryPath,
                filenameFormat: existingSettings.filenameFormat || 'publication-number',
                createSubfolders: existingSettings.createSubfolders || false
            };
            
            console.log('Saving download settings:', downloadSettings);
            
            if (window.electronAPI && window.electronAPI.saveDownloadSettings) {
                const result = await window.electronAPI.saveDownloadSettings(downloadSettings);
                
                if (result.success) {
                    console.log('✅ Download directory auto-saved successfully');
                    this.showAlert('Download directory saved successfully!', 'success');
                } else {
                    console.error('❌ Failed to auto-save download directory:', result.message);
                    this.showAlert('Failed to save directory: ' + result.message, 'error');
                }
            }
        } catch (error) {
            console.error('❌ Error auto-saving download directory:', error);
            this.showAlert('Error saving directory: ' + error.message, 'error');
        }
    }

    async saveSettings() {
        try {
            const usptoApiKey = document.getElementById('uspto-api-key').value.trim();
            const espacenetConsumerKey = document.getElementById('espacenet-consumer-key').value.trim();
            const espacenetSecretKey = document.getElementById('espacenet-secret-key').value.trim();

            const apiKeys = {
                usptoApiKey,
                espacenetConsumerKey,
                espacenetSecretKey
            };

            const result = await window.electronAPI.saveApiKeys(apiKeys);
            
            if (result.success) {
                this.showAlert('Settings saved successfully!', 'success');
            } else {
                this.showAlert('Failed to save settings: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showAlert('An error occurred while saving settings.', 'error');
        }
    }

    initializeDownloadView() {
        console.log('Initializing download view...');
        
        // Initialize download publications functionality
        let publicationsList = [];
        
        const publicationInput = document.getElementById('publication-number-input');
        const addButton = document.getElementById('add-publication');
        const clearAllButton = document.getElementById('clear-all-publications');
        const downloadButton = document.getElementById('download-publications');
        const publicationsListContainer = document.getElementById('publications-list');
        const publicationsCount = document.getElementById('publications-count');
        const downloadProgress = document.getElementById('download-progress');
        
        console.log('Elements found:', {
            publicationInput: !!publicationInput,
            addButton: !!addButton,
            clearAllButton: !!clearAllButton,
            downloadButton: !!downloadButton
        });
        
        if (!publicationInput || !addButton) {
            console.error('Required elements not found');
            return;
        }
        
        // Add publication number
        addButton.addEventListener('click', () => {
            console.log('Add button clicked');
            this.addPublication(publicationsList, publicationInput, publicationsListContainer, publicationsCount, downloadButton);
        });
        
        publicationInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addPublication(publicationsList, publicationInput, publicationsListContainer, publicationsCount, downloadButton);
            }
        });
        
        // Clear all publications
        if (clearAllButton) {
            clearAllButton.addEventListener('click', () => {
                publicationsList.length = 0; // Clear array
                this.updatePublicationsList(publicationsList, publicationsListContainer, publicationsCount);
                this.updateDownloadButton(publicationsList, downloadButton);
            });
        }
        
        // Download publications
        if (downloadButton) {
            downloadButton.addEventListener('click', () => {
                this.downloadPublications(publicationsList, downloadProgress);
            });
        }
        
        // Clear download history
        const clearHistoryButton = document.getElementById('clear-download-history');
        if (clearHistoryButton) {
            clearHistoryButton.addEventListener('click', () => {
                this.clearDownloadHistory();
            });
        }
        
        console.log('Download view initialized successfully');
    }
    
    addPublication(publicationsList, publicationInput, publicationsListContainer, publicationsCount, downloadButton) {
        console.log('Add publication called');
        const input = publicationInput.value.trim().toUpperCase();
        if (!input) {
            console.log('Empty input');
            return;
        }
        
        console.log('Validating:', input);
        
        // Validate publication number format
        if (!this.isValidPublicationNumber(input)) {
            this.showAlert('Invalid publication number format. Please use formats like US10721857B2, EP1234567A1, etc.', 'error');
            return;
        }
        
        // Check if already exists
        if (publicationsList.includes(input)) {
            this.showAlert('This publication number is already in the list.', 'error');
            return;
        }
        
        // Add to list
        publicationsList.push(input);
        publicationInput.value = '';
        this.updatePublicationsList(publicationsList, publicationsListContainer, publicationsCount);
        this.updateDownloadButton(publicationsList, downloadButton);
        console.log('Publication added:', input);
    }
    
    isValidPublicationNumber(pubNumber) {
        // Valid country codes
        const validCountryCodes = ['US', 'EP', 'WO', 'JP', 'CN', 'IN'];
        
        // Pattern: CC + numbers + kind code (letter + optional digit/letter)
        // Examples: US10721857B2, EP1234567A1, JP2008258627A, WO2023123456A1
        const pattern = /^([A-Z]{2})(\d+)([A-Z][A-Z0-9]?)$/;
        const match = pubNumber.match(pattern);
        
        if (!match) return false;
        
        const countryCode = match[1];
        const numberPart = match[2];
        const kindCode = match[3];
        
        // Check if country code is valid
        if (!validCountryCodes.includes(countryCode)) return false;
        
        // Check if number part has reasonable length (4-12 digits)
        if (numberPart.length < 4 || numberPart.length > 12) return false;
        
        // Kind code should be 1-3 characters starting with a letter
        // Common formats: A, A1, A2, B1, B2, etc.
        if (kindCode.length < 1 || kindCode.length > 3) return false;
        
        return true;
    }
    
    updatePublicationsList(publicationsList, publicationsListContainer, publicationsCount) {
        if (!publicationsListContainer) return;
        
        if (publicationsList.length === 0) {
            publicationsListContainer.innerHTML = `
                <div class="empty-state">
                    <p>No publications added yet. Add publication numbers above to get started.</p>
                </div>
            `;
        } else {
            publicationsListContainer.innerHTML = publicationsList.map((pubNumber, index) => `
                <div class="publication-item">
                    <span class="publication-number">${pubNumber}</span>
                    <button class="remove-publication" onclick="window.patentApp.removePublication('${pubNumber}')">Remove</button>
                </div>
            `).join('');
        }
        
        // Update count
        if (publicationsCount) {
            publicationsCount.textContent = `${publicationsList.length} publication${publicationsList.length !== 1 ? 's' : ''} selected`;
        }
    }
    
    updateDownloadButton(publicationsList, downloadButton) {
        if (downloadButton) {
            downloadButton.disabled = publicationsList.length === 0;
        }
    }
    
    removePublication(pubNumber) {
        console.log('Removing publication:', pubNumber);
        // This needs to access the current view's publication list
        // For now, we'll implement this in the view context
        const publicationsListContainer = document.getElementById('publications-list');
        const publicationsCount = document.getElementById('publications-count');
        const downloadButton = document.getElementById('download-publications');
        
        // Find and remove from displayed list (temporary solution)
        const publicationItems = document.querySelectorAll('.publication-item');
        publicationItems.forEach(item => {
            const numberSpan = item.querySelector('.publication-number');
            if (numberSpan && numberSpan.textContent === pubNumber) {
                item.remove();
            }
        });
        
        // Update count display
        const remainingCount = document.querySelectorAll('.publication-item').length;
        if (publicationsCount) {
            publicationsCount.textContent = `${remainingCount} publication${remainingCount !== 1 ? 's' : ''} selected`;
        }
        if (downloadButton) {
            downloadButton.disabled = remainingCount === 0;
        }
        
        if (remainingCount === 0 && publicationsListContainer) {
            publicationsListContainer.innerHTML = `
                <div class="empty-state">
                    <p>No publications added yet. Add publication numbers above to get started.</p>
                </div>
            `;
        }
    }
    
    async downloadPublications(publicationsList, downloadProgress) {
        if (publicationsList.length === 0) return;
        
        console.log('Starting download for publications:', publicationsList);
        
        const downloadType = document.querySelector('input[name="downloadType"]:checked')?.value || 'frontpage';
        console.log('Download type:', downloadType);
        
        // Check if electronAPI is available
        if (!window.electronAPI || !window.electronAPI.downloadPatent) {
            this.showAlert('Download functionality not available. Please ensure the app is properly loaded.', 'error');
            return;
        }
        
        // Show progress section
        if (downloadProgress) {
            downloadProgress.classList.remove('hidden');
        }
        
        // Initialize or append to progress list (preserve existing downloads)
        const progressList = document.getElementById('progress-list');
        if (progressList) {
            // Create new progress items for current downloads
            const newProgressItems = publicationsList.map(pubNumber => {
                const cleanId = pubNumber.replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now(); // Add timestamp to avoid ID conflicts
                const docType = downloadType === 'frontpage' ? 'Front Page' : 'Full Application';
                return `
                    <div class="progress-item" id="progress-${cleanId}" data-pub-number="${pubNumber}">
                        <div class="progress-header-row">
                            <span class="progress-publication">${pubNumber}</span>
                            <span class="progress-type">${docType}</span>
                        </div>
                        <div class="progress-details">
                            <span class="progress-text">Preparing...</span>
                            <div class="progress-actions">
                                <span class="progress-timestamp"></span>
                                <button class="open-folder-btn" disabled>
                                    📂 Open Folder
                                </button>
                                <span class="progress-status status-pending">Pending</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Append new items to existing content (don't replace)
            progressList.innerHTML += newProgressItems;
        }
        
        // Disable download button
        const downloadButton = document.getElementById('download-publications');
        if (downloadButton) {
            downloadButton.disabled = true;
            downloadButton.textContent = 'Downloading...';
        }
        
        try {
            console.log('Starting download process for', publicationsList.length, 'publications');
            
            // Process each publication
            for (let i = 0; i < publicationsList.length; i++) {
                const pubNumber = publicationsList[i];
                console.log(`\n=== Processing publication ${i + 1}/${publicationsList.length}: ${pubNumber} ===`);
                
                // Find the most recent progress item for this publication (by data attribute)
                const progressItems = document.querySelectorAll(`[data-pub-number="${pubNumber}"]`);
                const progressItem = progressItems[progressItems.length - 1]; // Get the latest one
                
                if (progressItem) {
                    const statusElement = progressItem.querySelector('.progress-status');
                    const progressText = progressItem.querySelector('.progress-text');
                    const timestampElement = progressItem.querySelector('.progress-timestamp');
                    const openFolderBtn = progressItem.querySelector('.open-folder-btn');
                    
                    // Update status to downloading
                    statusElement.textContent = 'Downloading';
                    statusElement.className = 'progress-status status-downloading';
                    
                    // Show different progress text based on download type
                    if (downloadType === 'fullapp') {
                        progressText.textContent = 'Downloading full application document...';
                    } else {
                        progressText.textContent = 'Downloading front page...';
                    }
                    
                    try {
                        console.log('Calling electronAPI.downloadPatent with params:', {
                            publicationNumber: pubNumber,
                            downloadType: downloadType
                        });
                        
                        // Call download function
                        const result = await window.electronAPI.downloadPatent({
                            publicationNumber: pubNumber,
                            downloadType: downloadType
                        });
                        
                        console.log('Download result for', pubNumber, ':', result);
                        
                        if (result.success) {
                            const now = new Date();
                            const timestamp = now.toLocaleTimeString();
                            
                            statusElement.textContent = 'Completed';
                            statusElement.className = 'progress-status status-completed';
                            progressText.textContent = `Downloaded successfully`;
                            timestampElement.textContent = `Completed at ${timestamp}`;
                            
                            // Enable open folder button
                            if (openFolderBtn && result.filePath) {
                                openFolderBtn.disabled = false;
                                openFolderBtn.onclick = () => this.openFileLocation(result.filePath);
                            }
                            
                            console.log('✅ Successfully downloaded:', pubNumber, 'to', result.filePath || 'unknown path');
                        } else {
                            console.error('❌ Download failed for', pubNumber, ':', result.message);
                            statusElement.textContent = 'Error';
                            statusElement.className = 'progress-status status-error';
                            progressText.textContent = result.message || 'Unknown error occurred';
                            timestampElement.textContent = `Failed at ${new Date().toLocaleTimeString()}`;
                        }
                    } catch (error) {
                        console.error('❌ Exception during download for', pubNumber, ':', error);
                        statusElement.textContent = 'Error';
                        statusElement.className = 'progress-status status-error';
                        progressText.textContent = error.message;
                        timestampElement.textContent = `Error at ${new Date().toLocaleTimeString()}`;
                    }
                }
            }
            
            console.log('=== Download process completed ===');
            
        } catch (error) {
            console.error('Fatal error during download process:', error);
            this.showAlert('Download failed: ' + error.message, 'error');
        } finally {
            // Re-enable download button
            if (downloadButton) {
                downloadButton.disabled = false;
                downloadButton.textContent = 'Download Selected Publications';
            }
            console.log('Download UI reset completed');
        }
    }

    initializeCoversheetView() {
        // Initialize coversheet generation functionality
        const generateButton = document.getElementById('generate-coversheet-btn');
        if (generateButton) {
            generateButton.addEventListener('click', () => this.generateCoversheet());
        }
    }

    async initializeFileWrapperView() {
        console.log('Initializing file wrapper view...');
        
        // Get DOM elements
        const applicationInput = document.getElementById('application-number-input');
        const fetchButton = document.getElementById('fetch-documents');
        const documentsSection = document.getElementById('documents-section');
        const documentsList = document.getElementById('documents-list');
        const selectAllButton = document.getElementById('select-all-documents');
        const clearAllButton = document.getElementById('clear-all-documents');
        const downloadButton = document.getElementById('download-selected');
        const selectedCount = document.getElementById('selected-count');
        
        if (!applicationInput || !fetchButton) {
            console.error('Required file wrapper elements not found');
            return;
        }
        
        // Store documents data
        let documentsData = [];
        
        // Fetch documents
        fetchButton.addEventListener('click', async () => {
            await this.fetchFileWrapperDocuments(applicationInput, documentsSection, documentsList, documentsData);
            this.updateFileWrapperDownloadButton(documentsData, selectedCount, downloadButton);
        });
        
        // Allow Enter key to trigger fetch
        applicationInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                await this.fetchFileWrapperDocuments(applicationInput, documentsSection, documentsList, documentsData);
                this.updateFileWrapperDownloadButton(documentsData, selectedCount, downloadButton);
            }
        });
        
        // Select/Clear all functionality
        if (selectAllButton) {
            selectAllButton.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('.document-checkbox');
                checkboxes.forEach(checkbox => checkbox.checked = true);
                this.updateFileWrapperDownloadButton(documentsData, selectedCount, downloadButton);
            });
        }
        
        if (clearAllButton) {
            clearAllButton.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('.document-checkbox');
                checkboxes.forEach(checkbox => checkbox.checked = false);
                this.updateFileWrapperDownloadButton(documentsData, selectedCount, downloadButton);
            });
        }
        
        // Download selected documents
        if (downloadButton) {
            downloadButton.addEventListener('click', () => {
                this.downloadSelectedFileWrapperDocuments(documentsData);
            });
        }
        
        console.log('File wrapper view initialized successfully');
    }

    // Legacy methods - functionality now handled in view-specific JavaScript
    async searchPatents() {
        // This method is no longer used - search functionality moved to download-publications.html
        console.log('Legacy searchPatents method called');
    }

    async downloadSelectedPatents() {
        // This method is no longer used - download functionality moved to download-publications.html  
        console.log('Legacy downloadSelectedPatents method called');
    }

    async generateCoversheet() {
        // Placeholder for coversheet generation
        this.showAlert('Coversheet generation functionality will be implemented here.', 'info');
    }

    async fetchFileWrapperDocuments(applicationInput, documentsSection, documentsList, documentsData) {
        const appNumber = applicationInput.value.trim();
        if (!appNumber) {
            this.showAlert('Please enter an application number', 'error');
            return;
        }
        
        try {
            // Show loading state
            documentsList.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div>Fetching documents...</div>';
            documentsSection.classList.remove('hidden');
            
            console.log('Fetching documents for application:', appNumber);
            
            // Call backend to fetch USPTO documents
            const result = await window.electronAPI.fetchFileWrapperDocuments(appNumber);
            
            if (result.success && result.documents) {
                // Clear documents data and populate with new data
                documentsData.length = 0;
                documentsData.push(...result.documents);
                
                // Populate documents list
                this.populateFileWrapperDocuments(documentsList, documentsData);
                
                console.log(`Fetched ${documentsData.length} documents`);
            } else {
                console.error('Failed to fetch documents:', result.message);
                documentsList.innerHTML = `<div class="loading-state">❌ ${result.message || 'Failed to fetch documents'}</div>`;
            }
        } catch (error) {
            console.error('Error fetching documents:', error);
            documentsList.innerHTML = `<div class="loading-state">❌ Error: ${error.message}</div>`;
        }
    }
    
    populateFileWrapperDocuments(documentsList, documentsData) {
        if (documentsData.length === 0) {
            documentsList.innerHTML = '<div class="loading-state">No documents found for this application.</div>';
            return;
        }
        
        documentsList.innerHTML = documentsData.map((doc, index) => {
            // Format the official date
            const dateStr = doc.officialDate ? new Date(doc.officialDate).toLocaleDateString() : 'N/A';
            
            // Check if document has download URL
            const hasDownload = doc.downloadUrl ? '✅' : '❌';
            const downloadStatus = doc.downloadUrl ? '' : ' (No download available)';
            
            return `
                <div class="document-item" onclick="this.querySelector('input').click()">
                    <input 
                        type="checkbox" 
                        class="document-checkbox" 
                        data-index="${index}"
                        ${!doc.downloadUrl ? 'disabled' : ''}
                        onchange="window.patentApp.updateFileWrapperDownloadButton(); event.stopPropagation()"
                    >
                    <div class="document-info">
                        <div class="document-title">
                            ${hasDownload} ${doc.documentCodeDescriptionText || doc.documentDescription || 'Document'}${downloadStatus}
                        </div>
                        <div class="document-details">
                            <span class="document-code">${doc.documentCode || 'N/A'}</span>
                            <span>ID: ${doc.documentIdentifier || 'N/A'}</span>
                            <span>Date: ${dateStr}</span>
                            <span>Direction: ${doc.directionCategory || 'N/A'}</span>
                            ${doc.pageTotalQuantity ? `<span>Pages: ${doc.pageTotalQuantity}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateFileWrapperDownloadButton(documentsData, selectedCount, downloadButton) {
        // This method can be called from different contexts, so we need to get elements if not provided
        if (!selectedCount) selectedCount = document.getElementById('selected-count');
        if (!downloadButton) downloadButton = document.getElementById('download-selected');
        
        const checkboxes = document.querySelectorAll('.document-checkbox:checked');
        const count = checkboxes.length;
        
        if (selectedCount) {
            selectedCount.textContent = `${count} document${count !== 1 ? 's' : ''} selected`;
        }
        
        if (downloadButton) {
            downloadButton.disabled = count === 0;
        }
    }
    
    async downloadSelectedFileWrapperDocuments(documentsData) {
        const checkboxes = document.querySelectorAll('.document-checkbox:checked');
        if (checkboxes.length === 0) {
            this.showAlert('Please select at least one document', 'error');
            return;
        }
        
        const selectedDocuments = Array.from(checkboxes).map(checkbox => {
            const index = parseInt(checkbox.dataset.index);
            return documentsData[index];
        });
        
        const downloadFormat = document.querySelector('input[name="downloadFormat"]:checked')?.value || 'zip';
        
        try {
            console.log(`Downloading ${selectedDocuments.length} documents as ${downloadFormat}`);
            
            // Initialize progress tracking
            this.initFileWrapperProgress(selectedDocuments.length, downloadFormat);
            
            // Call backend to download documents with progress tracking
            const result = await window.electronAPI.downloadFileWrapperDocuments({
                documents: selectedDocuments,
                format: downloadFormat
            });
            
            if (result.success) {
                console.log('Download completed, file path:', result.filePath);
                this.updateFileWrapperProgress(selectedDocuments.length, selectedDocuments.length, 'completed', result.filePath);
                this.showAlert(`Successfully downloaded ${selectedDocuments.length} documents`, 'success');
            } else {
                this.updateFileWrapperProgress(0, selectedDocuments.length, 'error', null, result.message);
                this.showAlert('Download failed: ' + (result.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error downloading documents:', error);
            this.updateFileWrapperProgress(0, selectedDocuments.length, 'error', null, error.message);
            this.showAlert('Download failed: ' + error.message, 'error');
        }
    }

    initFileWrapperProgress(totalDocuments, downloadFormat) {
        // Show progress section
        const progressSection = document.getElementById('file-wrapper-progress');
        if (progressSection) {
            progressSection.classList.remove('hidden');
        }
        
        // Initialize progress display
        const progressList = document.getElementById('file-wrapper-progress-list');
        if (progressList) {
            const timestamp = new Date().toLocaleString();
            progressList.innerHTML = `
                <div class="progress-item" id="file-wrapper-progress-item">
                    <div class="progress-header-row">
                        <span class="progress-publication">USPTO File Wrapper (${downloadFormat.toUpperCase()})</span>
                        <span class="progress-type">${totalDocuments} documents</span>
                    </div>
                    <div class="progress-details">
                        <span class="progress-text">Initializing download...</span>
                        <span class="progress-timestamp">${timestamp}</span>
                        <div class="progress-actions"></div>
                    </div>
                </div>
            `;
        }
    }
    
    updateFileWrapperProgress(completed, total, status, filePath = null, errorMessage = null) {
        const progressItem = document.getElementById('file-wrapper-progress-item');
        if (!progressItem) return;
        
        const progressText = progressItem.querySelector('.progress-text');
        const progressTimestamp = progressItem.querySelector('.progress-timestamp');
        const progressActions = progressItem.querySelector('.progress-actions');
        
        const timestamp = new Date().toLocaleString();
        
        if (status === 'downloading') {
            if (progressText) progressText.textContent = `Downloading document ${completed + 1} of ${total}...`;
        } else if (status === 'processing') {
            if (progressText) progressText.textContent = `Processing documents (${completed}/${total})...`;
        } else if (status === 'merging') {
            if (progressText) progressText.textContent = 'Merging PDFs...';
        } else if (status === 'creating-zip') {
            if (progressText) progressText.textContent = 'Creating ZIP file...';
        } else if (status === 'completed') {
            if (progressText) progressText.textContent = `✅ Successfully downloaded ${total} documents`;
            if (progressActions && filePath) {
                progressActions.innerHTML = `
                    <button class="btn btn-small file-wrapper-open-file" data-file-path="${filePath}">
                        📂 Open File
                    </button>
                    <button class="btn btn-small file-wrapper-show-folder" data-file-path="${filePath}">
                        � Show in Folder
                    </button>
                `;
                
                // Add event listeners for the buttons
                const openFileBtn = progressActions.querySelector('.file-wrapper-open-file');
                const showFolderBtn = progressActions.querySelector('.file-wrapper-show-folder');
                
                if (openFileBtn) {
                    openFileBtn.addEventListener('click', () => {
                        console.log('Opening file:', filePath);
                        window.electronAPI.openPath(filePath);
                    });
                }
                
                if (showFolderBtn) {
                    showFolderBtn.addEventListener('click', () => {
                        console.log('Showing folder for:', filePath);
                        window.electronAPI.showItemInFolder(filePath);
                    });
                }
            }
        } else if (status === 'error') {
            if (progressText) progressText.textContent = `❌ Download failed: ${errorMessage || 'Unknown error'}`;
            progressItem.classList.add('error');
        }
        
        if (progressTimestamp) {
            progressTimestamp.textContent = timestamp;
        }
    }

    updateTitle(viewName) {
        const titles = {
            'download-publications': 'Download Patent Publications',
            'file-wrapper-download': 'USPTO File Wrapper Download',
            'generate-coversheet': 'Generate Granted Patent Coversheet',
            'settings': 'Settings'
        };
        
        this.contentTitle.textContent = titles[viewName] || 'Patent Coversheet App';
    }

    loadDefaultView() {
        // Load settings view by default to encourage API key setup
        setTimeout(() => {
            const settingsButton = document.querySelector('[data-view="settings"]');
            if (settingsButton) {
                settingsButton.click();
            }
        }, 100);
    }

    showLoading() {
        this.loadingOverlay.classList.add('show');
    }

    hideLoading() {
        this.loadingOverlay.classList.remove('show');
    }

    showAlert(message, type = 'info') {
        // Remove existing alerts
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());

        // Create new alert
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;

        // Insert at the top of content body
        this.contentBody.insertBefore(alert, this.contentBody.firstChild);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    showError(message) {
        this.showAlert(message, 'error');
    }
    
    async openFileLocation(filePath) {
        if (!window.electronAPI || !window.electronAPI.openFileLocation) {
            this.showAlert('Open folder functionality not available', 'error');
            return;
        }
        
        try {
            console.log('Opening file location:', filePath);
            const result = await window.electronAPI.openFileLocation(filePath);
            
            if (!result.success) {
                this.showAlert('Failed to open folder: ' + (result.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error opening file location:', error);
            this.showAlert('Failed to open folder: ' + error.message, 'error');
        }
    }
    
    clearDownloadHistory() {
        const progressList = document.getElementById('progress-list');
        const downloadProgress = document.getElementById('download-progress');
        
        if (progressList) {
            progressList.innerHTML = '';
            console.log('Download history cleared');
        }
        
        // Hide progress section if no items
        if (downloadProgress) {
            downloadProgress.classList.add('hidden');
        }
        
        this.showAlert('Download history cleared', 'info');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.patentApp = new PatentApp();
});

// Utility functions
window.appUtils = {
    formatDate: (date) => {
        return new Date(date).toLocaleDateString();
    },
    
    validateApiKey: (key) => {
        return key && key.length > 0 && /^[a-zA-Z0-9]+$/.test(key);
    },
    
    sanitizeInput: (input) => {
        return input.trim().replace(/[<>]/g, '');
    }
};
