# Project Structure

## 📁 Directory Organization

```
TerraformResourceExplorer/
├── src/                          # Source code
│   ├── js/                       # JavaScript files
│   │   ├── script.js            # Main extension logic
│   │   └── content.js           # Content script
│   ├── lib/                      # Third-party libraries
│   │   └── cytoscape.min.js     # Graph visualization library
│   └── index.html               # Extension popup
├── assets/                       # Static assets
│   ├── icons/                   # Extension icons
│   │   ├── icon16.png          # 16x16 toolbar icon
│   │   ├── icon96.png          # 48x48 icon
│   │   └── store-icon-128.png  # 128x128 store icon
│   └── screenshots/             # Store screenshots
│       ├── chrome-store/        # Chrome Store formatted
│       └── original/            # Original screenshots
├── docs/                        # Documentation
│   ├── README.md               # Main documentation
│   ├── INSTALLATION.md         # Installation guide
│   ├── DEPENDENCY_FEATURES.md  # Feature documentation
│   ├── SECURITY_COMPLIANCE.md  # Security info
│   ├── chrome-store-description.md
│   └── chrome-store-assets.md
├── scripts/                     # Build scripts
│   └── distribute.sh           # Distribution script
├── manifest.json               # Extension manifest
├── package.json               # Project metadata
├── .gitignore                 # Git ignore rules
└── PROJECT_STRUCTURE.md       # This file
```

## 🎯 **Key Files**

### **Core Extension Files**
- `manifest.json` - Extension configuration and permissions
- `src/js/script.js` - Main functionality and graph logic
- `src/js/content.js` - Content script for page injection
- `src/index.html` - Extension popup interface

### **Assets**
- `assets/icons/` - All extension icons in various sizes
- `assets/screenshots/` - Store screenshots and promotional images

### **Documentation**
- `docs/README.md` - Main project documentation
- `docs/INSTALLATION.md` - User installation guide
- `docs/SECURITY_COMPLIANCE.md` - Security and privacy info

### **Build & Distribution**
- `scripts/distribute.sh` - Creates distribution packages
- `package.json` - Project metadata and scripts

## 🔧 **Development Workflow**

1. **Edit source files** in `src/` directory
2. **Test locally** by loading unpacked extension
3. **Run distribution script** to create production package
4. **Update documentation** in `docs/` as needed

## 📦 **Distribution**

The `scripts/distribute.sh` script creates a production-ready package that:
- Maintains proper file structure for Chrome Web Store
- Includes all necessary assets and icons
- Excludes development files and documentation
- Creates a clean ZIP file for distribution

## 🎨 **Asset Management**

- **Icons**: All stored in `assets/icons/` with proper naming
- **Screenshots**: Organized in `assets/screenshots/` with Chrome Store formatting
- **Data files**: Stored in `src/assets/` for easy access by scripts

This structure provides clear separation of concerns and makes the project easy to maintain and extend.
