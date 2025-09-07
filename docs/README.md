# Terraform Resource Explorer

A browser extension that visualizes Terraform configurations as interactive dependency graphs, with advanced features for resource exploration and canvas state management.

## Features

### **Core Functionality**
- **Interactive Dependency Tree**: View Terraform resources in a hierarchical, expandable tree structure
- **Real-time Parsing**: Automatically parses HCL files and builds dependency relationships
- **Resource Details**: Click resources to view complete attribute information
- **Dependency Highlighting**: Click any resource to highlight its dependents in red
- **Documentation Links**: Direct links to official Terraform provider documentation

### **Tree Navigation**
- **Expandable Hierarchy**: Click the arrow to expand and see dependent resources
- **Clean Top-Level View**: See foundation resources first, drill down as needed
- **Visual Hierarchy**: Nested resources with clear indentation and borders
- **Interactive Highlighting**: Click resource names to highlight dependencies

### **Resource Information**
- **Complete Attributes**: View all key-value pairs from resource configuration
- **Dependencies**: See explicit `depends_on` relationships
- **References**: View implicit references to other resources
- **Copy Resource IDs**: Easy copying of resource identifiers
- **Documentation Links**: Direct links to official Terraform docs

### **Canvas Management**
- **Auto-save**: Automatically saves changes when you modify the graph
- **State Restoration**: Automatically restores your previous layout when returning to a URL
- **Visual Feedback**: Status indicators show when auto-save occurs

### **Graph Controls**
- **Zoom Controls**: Zoom in/out and reset view
- **Pan Mode**: Navigate around the graph
- **Draw Mode**: Create custom relationships between resources
- **Clear Function**: Remove drawn relationships

### **Smart Documentation Links**
- **Dynamic AWS Links**: Uses official AWS documentation CSV for accurate links
- **Pattern-based Fallback**: Supports Azure, Google Cloud, Kubernetes, and other providers
- **Automatic Updates**: No need to maintain hardcoded URL lists

## Usage

### Basic Navigation
1. **Open Extension**: Click the extension icon on any Terraform file
2. **View Tree**: The dependency tree will automatically load
3. **Expand Resources**: Click ▶ to see dependent resources
4. **Highlight Dependencies**: Click resource names to highlight dependents
5. **View Details**: Click resource names to see complete attribute information

### Canvas State Management
1. **Auto-save**: Changes are automatically saved when you modify the graph
2. **Automatic Restoration**: Your layout is automatically restored when returning to a URL
3. **Clear State**: Use "Clear" to remove drawn relationships and reset

### Drawing Custom Relationships
1. **Enter Draw Mode**: Click the "Draw" button
2. **Select Nodes**: Click two nodes to create a relationship
3. **Exit Draw Mode**: Click "Exit Draw" when finished

### Resource Details
1. **Click Resource Names**: View detailed resource information with all attributes
2. **View Dependencies**: See explicit `depends_on` and implicit references
3. **Copy IDs**: Click the resource ID field to copy
4. **View Documentation**: Click documentation links for official docs
5. **Highlight Dependents**: Click any resource to see what depends on it

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
