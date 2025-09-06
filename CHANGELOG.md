# Changelog

All notable changes to the Terraform Resource Explorer extension will be documented in this file.

## [1.1.0] - 2024-12-19

### Added
- **Interactive Dependency Tree**: Complete redesign with expandable hierarchical tree structure
- **Dependency Highlighting**: Click any resource to highlight its dependents in red
- **Complete Resource Attributes**: View all key-value pairs from resource configuration in popup
- **Expandable Navigation**: Click ▶ to expand and see dependent resources
- **Clean Top-Level View**: Foundation resources shown first, drill down as needed
- **Visual Hierarchy**: Nested resources with clear indentation and borders

### Changed
- **Tree Structure**: Replaced flat list with hierarchical dependency tree
- **Resource Details**: Removed line numbers, added complete attribute display
- **User Interface**: Cleaner, more intuitive navigation with expand/collapse buttons
- **Dependency Visualization**: Interactive highlighting instead of text descriptions

### Improved
- **User Experience**: More intuitive way to explore Terraform dependencies
- **Visual Clarity**: Clear hierarchy shows actual code structure
- **Information Density**: Complete resource information in organized popups
- **Navigation**: Easy expansion/collapse with visual feedback

## [1.0.0] - 2024-12-18

### Added
- Initial release with basic graph visualization
- Interactive node clicking for resource details
- Canvas state management with auto-save
- Documentation links to official Terraform docs
- Support for multiple Terraform providers
- Resource attribute categorization
- Copy functionality for resource IDs
