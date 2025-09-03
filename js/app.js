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
        this.loadDefaultView();
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
        // Initialize download publications functionality
        const searchButton = document.getElementById('search-patents');
        if (searchButton) {
            searchButton.addEventListener('click', () => this.searchPatents());
        }

        const downloadButton = document.getElementById('download-selected');
        if (downloadButton) {
            downloadButton.addEventListener('click', () => this.downloadSelectedPatents());
        }
    }

    initializeCoversheetView() {
        // Initialize coversheet generation functionality
        const generateButton = document.getElementById('generate-coversheet-btn');
        if (generateButton) {
            generateButton.addEventListener('click', () => this.generateCoversheet());
        }
    }

    async searchPatents() {
        // Placeholder for patent search functionality
        this.showAlert('Patent search functionality will be implemented here.', 'info');
    }

    async downloadSelectedPatents() {
        // Placeholder for download functionality
        this.showAlert('Patent download functionality will be implemented here.', 'info');
    }

    async generateCoversheet() {
        // Placeholder for coversheet generation
        this.showAlert('Coversheet generation functionality will be implemented here.', 'info');
    }

    updateTitle(viewName) {
        const titles = {
            'download-publications': 'Download Patent Publications',
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PatentApp();
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
