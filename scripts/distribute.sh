#!/bin/bash

# Terraform Resource Explorer Distribution Script
# This script creates a distribution package for the browser extension

echo "🚀 Creating Terraform Resource Explorer Distribution Package..."

# Set version
VERSION="1.0.0"
PACKAGE_NAME="terraform-resource-explorer-v${VERSION}"

# Create distribution directory
echo "📁 Creating distribution directory..."
mkdir -p dist

# Copy files to distribution directory
echo "📋 Copying files..."
cp manifest.json dist/
cp package.json dist/

# Copy source files maintaining structure
cp -r src dist/

# Copy assets
cp -r assets dist/

# Create root-level files for extension compatibility
cp src/js/script.js dist/script.js
cp src/js/content.js dist/content.js
cp src/index.html dist/index.html
cp -r src/lib dist/lib
cp assets/icons/icon16.png dist/icon16.png
cp assets/icons/icon96.png dist/icon96.png
cp assets/icons/store-icon-128.png dist/store-icon-128.png

# Create ZIP package
echo "📦 Creating ZIP package..."
cd dist
zip -r "../${PACKAGE_NAME}.zip" . -x "*.DS_Store*"
cd ..

# Create checksum
echo "🔍 Creating checksum..."
shasum -a 256 "${PACKAGE_NAME}.zip" > "${PACKAGE_NAME}.zip.sha256"

# Clean up
echo "🧹 Cleaning up..."
rm -rf dist

echo "✅ Distribution package created successfully!"
echo ""
echo "📦 Package: ${PACKAGE_NAME}.zip"
echo "🔍 Checksum: ${PACKAGE_NAME}.zip.sha256"
echo ""
echo "📋 Next steps:"
echo "1. Test the extension by loading it in Chrome"
echo "2. Upload to Chrome Web Store (optional)"
echo "3. Create a GitHub release with the ZIP file"
echo "4. Share with your team!"
echo ""
echo "🎉 Your Terraform Resource Explorer is ready to ship!"
