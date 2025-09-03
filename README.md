# Patent Coversheet App

A desktop application built with Electron.js for downloading patent publications and generating professional coversheets for granted patents.

## Features

- **Download Patent Publications**: Search and download patent documents from USPTO and Espacenet databases
- **Generate Patent Coversheets**: Create professional coversheets for granted patents
- **Settings Management**: Securely store API keys for USPTO and Espacenet services
- **Modern UI**: Clean, responsive interface with intuitive navigation
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Project Structure

```
patent-coversheet/
├── main.js                 # Main Electron process
├── preload.js             # Preload script for secure IPC
├── index.html             # Main application window
├── package.json           # Node.js dependencies and scripts
├── config.json            # API keys storage (auto-generated)
├── styles/
│   └── main.css           # Main application styles
├── js/
│   └── app.js             # Main application JavaScript
├── views/
│   ├── settings.html      # Settings view
│   ├── download-publications.html    # Patent download view
│   └── generate-coversheet.html     # Coversheet generation view
└── assets/                # Application assets (icons, etc.)
```

## Installation

1. **Clone or download** this repository to your local machine

2. **Install Node.js** (version 16 or higher) from [nodejs.org](https://nodejs.org/)

3. **Install dependencies**:
   ```bash
   npm install
   ```

## Development

### Running the Application

To start the application in development mode:
```bash
npm start
```

To start with developer tools open:
```bash
npm run dev
```

### API Keys Setup

Before using the patent search and download features, you'll need to obtain API keys:

1. **USPTO API Key**:
   - Visit [USPTO Developer Portal](https://developer.uspto.gov/)
   - Register for an account and obtain your API key
   - Enter the key in the Settings view

2. **Espacenet API Keys**:
   - Visit [EPO Developer Portal](https://developers.epo.org/)
   - Register for an account and create an application
   - Obtain your Consumer Key and Secret Key
   - Enter both keys in the Settings view

### Security Features

- **Secure IPC**: Uses Electron's contextBridge for secure communication between main and renderer processes
- **No Node Integration**: Renderer process runs without Node.js access for security
- **Local Storage**: API keys are stored locally in an encrypted JSON file
- **Input Validation**: Form inputs are validated and sanitized

## Usage

### 1. Settings Configuration
- Launch the application
- Navigate to Settings from the sidebar
- Enter your USPTO and Espacenet API keys
- Click "Save Settings" to store them securely

### 2. Download Patent Publications
- Click "Download Patent Publications" in the sidebar
- Enter search criteria (keywords, patent numbers, etc.)
- Select database(s) to search
- Review search results and select patents to download
- Click "Download Selected" to save patent documents

### 3. Generate Patent Coversheets
- Click "Generate Granted Patent Coversheet" in the sidebar
- Enter patent information manually or use "Auto-fill from Patent Number"
- Review the live preview of your coversheet
- Download as PDF or DOCX, or print directly

## Building for Distribution

To build the application for distribution:
```bash
npm run build
```

This will create installers for your current platform in the `dist/` folder.

## Technology Stack

- **Electron**: Desktop app framework
- **HTML/CSS/JavaScript**: Frontend technologies
- **Node.js**: Backend runtime
- **IPC (Inter-Process Communication)**: Secure communication between processes

## File Structure Details

### Main Process Files
- `main.js`: Handles window creation, IPC communication, and file operations
- `preload.js`: Provides secure APIs to the renderer process

### Renderer Process Files
- `index.html`: Main application layout with sidebar navigation
- `js/app.js`: Application logic, view management, and user interactions
- `styles/main.css`: Comprehensive styling for all views

### View Files
Each view is a self-contained HTML file with embedded styles and scripts:
- `settings.html`: API key configuration and app settings
- `download-publications.html`: Patent search and download interface
- `generate-coversheet.html`: Patent coversheet creation tool

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Check the Issues section on GitHub
- Review the documentation above
- Contact the development team

## Roadmap

- [ ] Implement actual USPTO API integration
- [ ] Implement actual Espacenet API integration
- [ ] Add PDF generation for coversheets
- [ ] Add DOCX export functionality
- [ ] Implement patent document OCR
- [ ] Add batch processing capabilities
- [ ] Create automated testing suite
- [ ] Add internationalization support

## Development Notes

### Adding New Views
1. Create a new HTML file in the `views/` folder
2. Add a navigation button in `index.html` with appropriate `data-view` attribute
3. Implement view-specific logic in `js/app.js`
4. Update the `updateTitle()` function with the new view name

### Modifying Styles
- Global styles are in `styles/main.css`
- View-specific styles can be embedded in the view HTML files
- Follow the existing CSS structure for consistency

### IPC Communication
- All IPC handlers are defined in `main.js`
- Secure APIs are exposed through `preload.js`
- Use `window.electronAPI` in renderer processes to access main process functions
