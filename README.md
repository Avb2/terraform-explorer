# Terraform Resource Explorer

A browser extension that visualizes Terraform configurations as interactive dependency graphs, with advanced features for resource exploration and canvas state management.

## Features

### 🎯 **Core Functionality**
- **Interactive Graph Visualization**: View Terraform resources and modules as connected nodes
- **Real-time Parsing**: Automatically parses HCL files and updates the graph
- **Resource Details**: Click nodes to view detailed resource information
- **Documentation Links**: Direct links to official Terraform provider documentation

### 🎨 **Canvas Management**
- **Save/Load Canvas States**: Preserve your graph layout and customizations per URL
- **Auto-save**: Automatically saves changes when you modify the graph
- **Keyboard Shortcuts**: Use `Ctrl+S` to manually save the current state
- **Visual Feedback**: Status indicators show when auto-save occurs

### 🔧 **Graph Controls**
- **Zoom Controls**: Zoom in/out and reset view
- **Pan Mode**: Navigate around the graph
- **Draw Mode**: Create custom relationships between resources
- **Clear Function**: Remove drawn relationships
- **Save/Load Buttons**: Manual state management

### 📊 **Resource Information**
- **Detailed Panels**: View all resource attributes and values
- **Categorized Attributes**: Organized by Common, Security, Network, and Other
- **Copy Resource IDs**: Easy copying of resource identifiers
- **Documentation Links**: Direct links to official Terraform docs

### 🔗 **Smart Documentation Links**
- **Dynamic AWS Links**: Uses official AWS documentation CSV for accurate links
- **Pattern-based Fallback**: Supports Azure, Google Cloud, Kubernetes, and other providers
- **Automatic Updates**: No need to maintain hardcoded URL lists

## Usage

### Basic Navigation
1. **Open Extension**: Click the extension icon on any Terraform file
2. **View Graph**: The dependency graph will automatically load
3. **Interact**: Click nodes for details, drag to pan, scroll to zoom

### Canvas State Management
1. **Auto-save**: Changes are automatically saved every 2 seconds after viewport changes
2. **Manual Save**: Click the "Save" button or press `Ctrl+S`
3. **Load State**: Click "Load" to restore your previous layout
4. **Clear State**: Use "Clear" to remove drawn relationships and reset

### Drawing Custom Relationships
1. **Enter Draw Mode**: Click the "Draw" button
2. **Select Nodes**: Click two nodes to create a relationship
3. **Exit Draw Mode**: Click "Exit Draw" when finished

### Resource Details
1. **Click Nodes**: View detailed resource information
2. **Copy IDs**: Click the resource ID field to copy
3. **View Documentation**: Click documentation links for official docs

## Technical Details

### Storage
- Uses `localStorage` for canvas state persistence
- States are saved per URL with automatic cleanup
- 7-day expiration for old states
- Automatic conflict resolution for URL changes

### Performance
- Debounced updates to prevent excessive saves
- Efficient state serialization
- Automatic cleanup of old data
- Optimized graph rendering

### Browser Compatibility
- Modern browsers with localStorage support
- Chrome, Firefox, Safari, Edge
- Requires JavaScript enabled

## Installation

1. Download the extension files
2. Load as unpacked extension in your browser
3. Navigate to any Terraform file
4. Click the extension icon to activate

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `script.js`: Main functionality and graph logic
- `content.js`: Content script for page integration
- `index.html`: Extension popup interface
- `aws_docs_menu_links_full (1).csv`: AWS documentation mapping

## Contributing

Feel free to submit issues and enhancement requests!
# terraform-explorer
