// script.js
let cy = null;
let sidebarEl = null;
let viewportSaveTimer = null;

console.log('script.js: Script loaded');

// --------- Globals ----------
// Global variable to store AWS documentation URLs (using pattern-based fallback)
let awsDocUrls = {};

// Function to generate provider documentation URLs
function getProviderDocUrl(resourceType) {
  // Check if we have an exact match in our loaded AWS URLs
  if (awsDocUrls[resourceType]) {
    return awsDocUrls[resourceType];
  }

  // Handle AWS resources with pattern matching as fallback
  if (resourceType.startsWith('aws_')) {
    const resourceName = resourceType.replace('aws_', '');
    return 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/' + resourceName;
  }

  // Handle Azure resources
  if (resourceType.startsWith('azurerm_')) {
    const resourceName = resourceType.replace('azurerm_', '');
    return 'https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/' + resourceName;
  }

  // Handle Google Cloud resources
  if (resourceType.startsWith('google_')) {
    const resourceName = resourceType.replace('google_', '');
    return 'https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/' + resourceName;
  }

  // Handle Kubernetes resources
  if (resourceType.startsWith('kubernetes_')) {
    const resourceName = resourceType.replace('kubernetes_', '');
    return 'https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/' + resourceName;
  }

  // Handle other providers with predictable patterns
  const providerPatterns = [
    { prefix: 'vsphere_', provider: 'vsphere' },
    { prefix: 'vault_', provider: 'vault' },
    { prefix: 'consul_', provider: 'consul' },
    { prefix: 'nomad_', provider: 'nomad' },
    { prefix: 'docker_', provider: 'docker' },
    { prefix: 'helm_', provider: 'helm' },
    { prefix: 'mysql_', provider: 'mysql' },
    { prefix: 'postgresql_', provider: 'postgresql' },
    { prefix: 'mongodb_', provider: 'mongodb' },
    { prefix: 'redis_', provider: 'redis' }
  ];

  for (const pattern of providerPatterns) {
    if (resourceType.startsWith(pattern.prefix)) {
      const resourceName = resourceType.replace(pattern.prefix, '');
      return 'https://registry.terraform.io/providers/hashicorp/' + pattern.provider + '/latest/docs/resources/' + resourceName;
    }
  }

  // Fallback to general registry search
  return 'https://registry.terraform.io/search?q=' + encodeURIComponent(resourceType);
}

const providerDocs = {
  aws_instance: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance',
  aws_s3_bucket: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket',
  aws_s3_bucket_acl: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_acl',
  aws_s3_bucket_policy: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy',
  aws_s3_object: 'https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_object'
};

const requiredAttributes = {
  aws_instance: ['ami', 'instance_type'],
  aws_s3_bucket: ['bucket'],
  aws_s3_bucket_acl: ['bucket', 'acl'],
  aws_s3_bucket_policy: ['bucket', 'policy'],
  aws_s3_object: ['bucket', 'key']
};

let debounceTimer = null;
let cytoscapeReady = false;
let graphUpdateTimer = null;
let lastContentHash = null;

// --------- Utils ----------

function ensureCytoscape(cb) {
  if (window.cytoscape) { cytoscapeReady = true; return cb(); }
  if (cytoscapeReady) return cb();
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('lib/cytoscape.min.js');
  s.onload = () => { cytoscapeReady = true; cb(); };
  s.onerror = () => console.error('initGraph: failed to load cytoscape from extension');
  (document.head || document.documentElement).appendChild(s);
}

function extFromPath(p) {
  try {
    const m = (p || '').match(/\.([a-z0-9]+)(?:\?|#|$)/i);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}

function isTerraformPath() {
  const nameEl =
    document.querySelector('a[data-testid="file-name-link"]') ||
    document.querySelector('.file-info a') ||
    document.querySelector('a[title$=".tf"]') ||
    document.querySelector('span[class*="file-info"] a') ||
    document.querySelector('div[data-testid="breadcrumb"] a:last-child');
  const name = nameEl ? nameEl.textContent.trim() : '';
  const ext = extFromPath(location.pathname) || extFromPath(name) || 'tf';
  return ['tf', 'hcl'].includes(ext);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

// --------- Extraction ----------
function collectCodeText() {
  // Try common code viewers first
  const candidateSelectors = [
    // GitHub
    'table.js-file-line-container td.blob-code pre',
    'table.js-file-line-container td.blob-code span.blob-code-inner',
    // GitLab
    '.blob-content pre code',
    '.file-content pre code',
    // Bitbucket
    '.highlight pre code',
    // Generic
    'pre code',
    'pre',
    'code',
    // "react" viewers / registries
    'div[class*="react-code-line"]',
    'span[class*="react-code-text"]',
    'div[class*="react-code-line-content"]',
    'div[data-testid="code-content"] pre, div[data-testid="code-content"] code',
    '[data-test-selector="code-viewer"] pre, [data-test-selector="code-viewer"] code',
    // raw line containers
    'td.blob-code',
    'span.blob-code-inner'
  ];

  let nodes = [];
  let selector = '';
  
  for (const sel of candidateSelectors) {
    const found = document.querySelectorAll(sel);
    if (found && found.length) {
      nodes = Array.from(found);
      selector = sel;
      console.log('processTerraformFile: Found content elements with selector:', sel, 'Count:', nodes.length);
      break;
    }
  }

  if (!nodes.length) return '';

  // Try to extract line numbers from GitHub-style line containers
  if (selector.includes('js-file-line-container')) {
    // For GitHub, get the line numbers from the table structure
    const lineContainers = document.querySelectorAll('table.js-file-line-container tr');
    const linesWithNumbers = [];
    
    lineContainers.forEach((row, index) => {
      const lineNumberCell = row.querySelector('td.blob-num');
      const codeCell = row.querySelector('td.blob-code');
      
      if (lineNumberCell && codeCell) {
        const lineNum = parseInt(lineNumberCell.textContent.trim());
        const codeText = codeCell.textContent || '';
        
        linesWithNumbers.push({
          lineNumber: lineNum,
          text: codeText.replace(/\u00a0/g, '')
        });
      }
    });
    
    if (linesWithNumbers.length > 0) {
      // Sort by line number and return the text, preserving empty lines
      linesWithNumbers.sort((a, b) => a.lineNumber - b.lineNumber);
      const result = linesWithNumbers.map(item => item.text).join('\n');
      console.log('GitHub content extraction: Found', linesWithNumbers.length, 'lines');
      return result;
    }
  }

  // Fallback: Preserve indentation & blank lines; normalize NBSPs
  const lines = nodes.map(n => (n.textContent || '').replace(/\u00a0/g, ''));
  // If we matched whole blocks (pre/code) instead of per-line, don't join by \n again
  const combined = lines.join('\n');
  return combined.includes('\n') ? combined : lines.join('\n');
}

// Function to get line number mapping for GitHub-style code viewers
function getLineNumberMapping() {
  // Try to get line numbers from GitHub-style line containers
  const lineContainers = document.querySelectorAll('table.js-file-line-container tr');
  if (lineContainers.length === 0) return null;
  
  const lineMapping = new Map();
  const linesWithNumbers = [];
  
  lineContainers.forEach((row, index) => {
    const lineNumberCell = row.querySelector('td.blob-num');
    const codeCell = row.querySelector('td.blob-code');
    
    if (lineNumberCell && codeCell) {
      const lineNum = parseInt(lineNumberCell.textContent.trim());
      const codeText = codeCell.textContent || '';
      
      linesWithNumbers.push({
        lineNumber: lineNum,
        text: codeText.replace(/\u00a0/g, ''),
        originalIndex: index
      });
    }
  });
  
  // Sort by line number to match the content collection order
  linesWithNumbers.sort((a, b) => a.lineNumber - b.lineNumber);
  
  // Create mapping from sorted array index to actual line number
  linesWithNumbers.forEach((item, sortedIndex) => {
    lineMapping.set(sortedIndex, item.lineNumber);
    console.log('Line mapping: sorted array index ' + sortedIndex + ' -> line number ' + item.lineNumber + ', content: "' + item.text.trim() + '"');
  });
  
  return lineMapping;
}

// --------- Parser ----------
function parseHCL(content) {
  console.log('parseHCL: Parsing content (first 100 chars):', content.substring(0, 100));
  const resources = [];
  const modules = [];
  const issues = [];
  const lines = content.split('\n');

  // Try to parse directly from GitHub DOM if available
  const lineContainers = document.querySelectorAll('table.js-file-line-container tr');
  if (lineContainers.length > 0) {
    console.log('Parsing directly from GitHub DOM structure');
    return parseFromGitHubDOM(lineContainers);
  }

  // Fallback to content parsing
  const lineMapping = getLineNumberMapping();

  let currentResource = null;
  let currentModule = null;
  let currentBlock = null;

  lines.forEach((raw, index) => {
    const line = raw.trim();
    // Get actual line number from mapping, or fall back to array index + 1
    const actualLineNumber = lineMapping ? (lineMapping.get(index) || index + 1) : index + 1;
    
    // Skip empty lines but still process them for line number mapping
    if (!line) return;
    
    if (line.startsWith('resource ')) {
      const m = line.match(/resource\s+"([^"]+)"\s+"([^"]+)"/);
      if (m) {
        console.log('Found resource ' + m[1] + '.' + m[2] + ' at array index ' + index + ', assigned line number ' + actualLineNumber);
        currentResource = { 
          type: m[1], 
          name: m[2], 
          line: actualLineNumber, 
          attributes: [],
          depends_on: [],
          references: [],
          blockStart: actualLineNumber
        };
        currentBlock = currentResource;
        resources.push(currentResource);
      }
    } else if (line.startsWith('module ')) {
      const m = line.match(/module\s+"([^"]+)"/);
      if (m) {
        console.log('Found module ' + m[1] + ' at array index ' + index + ', assigned line number ' + actualLineNumber);
        currentModule = { 
          name: m[1], 
          line: actualLineNumber, 
          source: '',
          depends_on: [],
          references: [],
          blockStart: actualLineNumber
        };
        currentBlock = currentModule;
        modules.push(currentModule);
      }
    } else if (currentBlock && /^\w+\s*=/.test(line)) {
      const parts = line.split('=');
      const attr = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      
      // Parse depends_on explicitly
      if (attr === 'depends_on') {
        const deps = parseDependsOnValue(value);
        currentBlock.depends_on.push(...deps);
      }
      
      // Check for implicit references in attribute values
      const refs = extractReferences(value);
      currentBlock.references.push(...refs);
      
      currentBlock.attributes.push({ name: attr, value: value });
    } else if (currentModule && line.startsWith('source ')) {
      const m = line.match(/source\s*=\s*"([^"]+)"/);
      if (m) currentModule.source = m[1];
    }
  });

  // Add block end lines
  resources.forEach(r => {
    r.blockEnd = findBlockEnd(lines, r.blockStart, lineMapping);
  });
  modules.forEach(m => {
    m.blockEnd = findBlockEnd(lines, m.blockStart, lineMapping);
  });

  resources.forEach(r => {
    const req = requiredAttributes[r.type] || [];
    req.forEach(a => {
      if (!r.attributes.some(attr => attr.name === a)) {
        issues.push('Missing required attribute "' + a + '" for ' + r.type + '.' + r.name + ' at line ' + r.line);
      }
    });
  });

  console.log('parseHCL: Resources:', resources);
  console.log('parseHCL: Modules:', modules);
  console.log('parseHCL: Issues:', issues);
  return { resources, modules, issues };
}

// Parse directly from GitHub DOM structure
function parseFromGitHubDOM(lineContainers) {
  console.log('parseFromGitHubDOM: Starting direct DOM parsing');
  const resources = [];
  const modules = [];
  const issues = [];

  let currentResource = null;
  let currentModule = null;
  let currentBlock = null;

  lineContainers.forEach((row, index) => {
    const lineNumberCell = row.querySelector('td.blob-num');
    const codeCell = row.querySelector('td.blob-code');
    
    if (!lineNumberCell || !codeCell) return;
    
    const lineNumber = parseInt(lineNumberCell.textContent.trim());
    const codeText = codeCell.textContent || '';
    const line = codeText.trim();
    
    console.log('Processing line ' + lineNumber + ': "' + line + '"');
    
    if (line.startsWith('resource ')) {
      const m = line.match(/resource\s+"([^"]+)"\s+"([^"]+)"/);
      if (m) {
        console.log('Found resource ' + m[1] + '.' + m[2] + ' at line ' + lineNumber);
        currentResource = { 
          type: m[1], 
          name: m[2], 
          line: lineNumber, 
          attributes: [],
          depends_on: [],
          references: [],
          blockStart: lineNumber
        };
        currentBlock = currentResource;
        resources.push(currentResource);
      }
    } else if (line.startsWith('module ')) {
      const m = line.match(/module\s+"([^"]+)"/);
      if (m) {
        console.log('Found module ' + m[1] + ' at line ' + lineNumber);
        currentModule = { 
          name: m[1], 
          line: lineNumber, 
          source: '',
          depends_on: [],
          references: [],
          blockStart: lineNumber
        };
        currentBlock = currentModule;
        modules.push(currentModule);
      }
    } else if (currentBlock && /^\w+\s*=/.test(line)) {
      const parts = line.split('=');
      const attr = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      
      // Parse depends_on explicitly
      if (attr === 'depends_on') {
        const deps = parseDependsOnValue(value);
        currentBlock.depends_on.push(...deps);
      }
      
      // Check for implicit references in attribute values
      const refs = extractReferences(value);
      currentBlock.references.push(...refs);
      
      currentBlock.attributes.push({ name: attr, value: value });
    } else if (currentModule && line.startsWith('source ')) {
      const m = line.match(/source\s*=\s*"([^"]+)"/);
      if (m) currentModule.source = m[1];
    }
  });

  // Add block end lines
  resources.forEach(r => {
    r.blockEnd = findBlockEndFromDOM(lineContainers, r.blockStart);
  });
  modules.forEach(m => {
    m.blockEnd = findBlockEndFromDOM(lineContainers, m.blockStart);
  });

  resources.forEach(r => {
    const req = requiredAttributes[r.type] || [];
    req.forEach(a => {
      if (!r.attributes.some(attr => attr.name === a)) {
        issues.push('Missing required attribute "' + a + '" for ' + r.type + '.' + r.name + ' at line ' + r.line);
      }
    });
  });

  console.log('parseFromGitHubDOM: Resources:', resources);
  console.log('parseFromGitHubDOM: Modules:', modules);
  console.log('parseFromGitHubDOM: Issues:', issues);
  return { resources, modules, issues };
}

// Helper function to find the end of a block from DOM
function findBlockEndFromDOM(lineContainers, startLine) {
  let depth = 0;
  let foundStart = false;
  
  for (let i = 0; i < lineContainers.length; i++) {
    const row = lineContainers[i];
    const lineNumberCell = row.querySelector('td.blob-num');
    const codeCell = row.querySelector('td.blob-code');
    
    if (!lineNumberCell || !codeCell) continue;
    
    const lineNumber = parseInt(lineNumberCell.textContent.trim());
    const codeText = codeCell.textContent || '';
    
    if (lineNumber === startLine) {
      foundStart = true;
    }
    
    if (foundStart) {
      if (codeText.includes('{')) depth++;
      if (codeText.includes('}')) {
        depth--;
        if (depth === 0) return lineNumber;
      }
    }
  }
  
  return startLine; // Fallback
}



// Helper function to find the end of a block
function findBlockEnd(lines, startLine, lineMapping) {
  let depth = 0;
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('{')) depth++;
    if (line.includes('}')) {
      depth--;
      if (depth === 0) {
        // Return actual line number if mapping is available
        return lineMapping ? (lineMapping.get(i) || i + 1) : i + 1;
      }
    }
  }
  return lines.length;
}

// Parse depends_on value (supports both list and single reference)
function parseDependsOnValue(value) {
  const deps = [];
  
  // Remove quotes and brackets
  const cleanValue = value.replace(/^\[|\]$/g, '').replace(/"/g, '');
  
  // Split by comma and clean up
  const parts = cleanValue.split(',').map(p => p.trim()).filter(p => p);
  
  parts.forEach(part => {
    // Handle different reference formats
    if (part.includes('.')) {
      // resource_type.resource_name format
      deps.push(part);
    } else if (part.startsWith('module.')) {
      // module.module_name format
      deps.push(part);
    } else if (part.startsWith('data.')) {
      // data.data_type.data_name format
      deps.push(part);
    }
  });
  
  return deps;
}

// Extract implicit references from attribute values
function extractReferences(value) {
  const refs = [];
  
  // Remove quotes
  const cleanValue = value.replace(/"/g, '');
  
  // Look for Terraform reference patterns
  const patterns = [
    // resource references: aws_instance.web.id
    /([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/g,
    // module outputs: module.vpc.vpc_id
    /(module\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/g,
    // data source references: data.aws_ami.ubuntu.id
    /(data\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/g,
    // variable references: var.environment
    /(var\.[a-z_][a-z0-9_]*)/g,
    // local references: local.common_tags
    /(local\.[a-z_][a-z0-9_]*)/g
  ];
  
  patterns.forEach(pattern => {
    const matches = cleanValue.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // Extract the base reference (without the attribute)
        const baseRef = match.split('.').slice(0, -1).join('.');
        if (baseRef && !refs.includes(baseRef)) {
          refs.push(baseRef);
        }
      });
    }
  });
  
  return refs;
}

// --------- Dependency Analysis ----------
function buildDependencyTree(resources, modules) {
  const allItems = [...resources, ...modules];
  const itemMap = new Map();
  const dependencyMap = new Map();
  
  // Create maps for quick lookup
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    itemMap.set(id, item);
    
    // Build dependency map (item -> its dependencies)
    const deps = [...(item.depends_on || []), ...(item.references || [])];
    dependencyMap.set(id, deps.filter(dep => itemMap.has(dep)));
  });
  
  // Find root nodes (no dependencies)
  const roots = [];
  const visited = new Set();
  
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    const deps = dependencyMap.get(id) || [];
    
    if (deps.length === 0 && !visited.has(id)) {
      const rootItem = { ...item, id, children: [], level: 0 };
      buildChildren(id, rootItem, 0, visited, dependencyMap, itemMap);
      roots.push(rootItem);
    }
  });
  
  // Handle remaining items (circular dependencies or complex graphs)
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    if (!visited.has(id)) {
      const orphanItem = { ...item, id, children: [], level: 0, isOrphan: true };
      buildChildren(id, orphanItem, 0, visited, dependencyMap, itemMap);
      roots.push(orphanItem);
    }
  });
  
  return roots;
}

function buildChildren(itemId, parentItem, level, visited, dependencyMap, itemMap) {
  visited.add(itemId);
  const children = [];
  
  // Find resources that depend on this item (these should be nested under it)
  for (const [id, deps] of dependencyMap.entries()) {
    if (deps.includes(itemId) && !visited.has(id)) {
      const childItem = itemMap.get(id);
      if (childItem) {
        const child = { ...childItem, id, children: [], level: level + 1 };
        buildChildren(id, child, level + 1, visited, dependencyMap, itemMap);
        children.push(child);
      }
    }
  }
  
  parentItem.children = children;
}

function renderDependencyTree(items, container) {
  function renderItem(item, level = 0, parentContainer = container) {
    const hasChildren = item.children && item.children.length > 0;
    
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      font-family: monospace;
      font-size: 13px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    // Expand/collapse button
    const expandBtn = document.createElement('button');
    expandBtn.style.cssText = `
      width: 16px;
      height: 16px;
      border: none;
      background: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #6b7280;
      padding: 0;
    `;
    
    if (hasChildren) {
      expandBtn.textContent = '▶';
      expandBtn.classList.add('collapsed');
    } else {
      expandBtn.textContent = '';
      expandBtn.style.visibility = 'hidden';
    }
    
    // Resource name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.type ? `${item.type}.${item.name}` : `module.${item.name}`;
    nameSpan.style.cssText = 'flex: 1;';
    
    // Store dependency info for highlighting
    itemDiv._itemData = item;
    itemDiv.setAttribute('data-item-id', item.id);
    
    itemDiv.appendChild(expandBtn);
    itemDiv.appendChild(nameSpan);
    
    // Hover effects
    itemDiv.addEventListener('mouseenter', () => {
      itemDiv.style.background = '#f8fafc';
    });
    
    itemDiv.addEventListener('mouseleave', () => {
      itemDiv.style.background = 'transparent';
    });
    
    // Click handler for resource details
    nameSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Clear previous highlights
      clearHighlights();
      
      // Highlight dependent resources
      highlightDependents(item, container);
      
      // Show details popup
      if (item.type) {
        showResourceDetails(item);
      } else {
        showModuleDetails(item);
      }
    });
    
    // Expand/collapse handler
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const childrenContainer = itemDiv.nextElementSibling;
      
      if (expandBtn.classList.contains('collapsed')) {
        // Expand
        expandBtn.textContent = '▼';
        expandBtn.classList.remove('collapsed');
        childrenContainer.style.display = 'block';
      } else {
        // Collapse
        expandBtn.textContent = '▶';
        expandBtn.classList.add('collapsed');
        childrenContainer.style.display = 'none';
      }
    });
    
    parentContainer.appendChild(itemDiv);
    
    // Create children container
    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.style.cssText = `
        display: none;
        margin-left: 24px;
        border-left: 1px solid #e5e7eb;
        padding-left: 8px;
      `;
      
      // Render children
      item.children.forEach(child => {
        renderItem(child, level + 1, childrenContainer);
      });
      
      parentContainer.appendChild(childrenContainer);
    }
  }
  
  items.forEach(item => {
    renderItem(item);
  });
}

function clearHighlights() {
  const highlighted = document.querySelectorAll('.dependency-highlight');
  highlighted.forEach(el => {
    el.classList.remove('dependency-highlight');
    el.style.background = '';
    el.style.borderLeft = '';
  });
}

function highlightDependents(selectedItem, container) {
  const itemId = selectedItem.id;
  const allItems = container.querySelectorAll('[data-item-id]');
  
  allItems.forEach(itemEl => {
    const itemData = itemEl._itemData;
    if (!itemData) return;
    
    const deps = [...(itemData.depends_on || []), ...(itemData.references || [])];
    
    // Check if this item depends on the selected item
    if (deps.includes(itemId)) {
      itemEl.classList.add('dependency-highlight');
      itemEl.style.background = '#fef2f2';
      itemEl.style.borderLeft = '3px solid #ef4444';
    }
  });
}

function buildRelationshipTree(resources, modules) {
  const allItems = [...resources, ...modules];
  const itemMap = new Map();
  const dependencyMap = new Map();
  const reverseDependencyMap = new Map();
  
  // Create maps for quick lookup
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    itemMap.set(id, item);
    
    // Build dependency map (item -> its dependencies)
    const deps = [...(item.depends_on || []), ...(item.references || [])];
    dependencyMap.set(id, deps.filter(dep => itemMap.has(dep)));
    
    // Build reverse dependency map (item -> what depends on it)
    reverseDependencyMap.set(id, []);
  });
  
  // Build reverse dependencies
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    const deps = dependencyMap.get(id) || [];
    deps.forEach(dep => {
      if (reverseDependencyMap.has(dep)) {
        reverseDependencyMap.get(dep).push(id);
      }
    });
  });
  
  // Find root nodes (no dependencies)
  const roots = [];
  const visited = new Set();
  
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    const deps = dependencyMap.get(id) || [];
    
    if (deps.length === 0) {
      const rootItem = { ...item, id, children: [], level: 0 };
      buildDependencyChain(id, rootItem, 0, visited, dependencyMap, reverseDependencyMap, itemMap);
      roots.push(rootItem);
    }
  });
  
  // Find dependency chains (resources with clear parent-child relationships)
  const dependencyChains = [];
  const processed = new Set();
  
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    if (!visited.has(id) && !processed.has(id)) {
      const chainItem = { ...item, id, children: [], level: 0 };
      buildDependencyChain(id, chainItem, 0, processed, dependencyMap, reverseDependencyMap, itemMap);
      if (chainItem.children.length > 0 || dependencyMap.get(id)?.length > 0) {
        dependencyChains.push(chainItem);
      }
    }
  });
  
  // Find circular dependencies
  const circularDeps = [];
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    if (!visited.has(id) && !processed.has(id)) {
      const circularItem = { ...item, id, children: [], level: 0, isCircular: true };
      circularDeps.push(circularItem);
    }
  });
  
  // Find orphans (no relationships at all)
  const orphans = [];
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    const deps = dependencyMap.get(id) || [];
    const dependents = reverseDependencyMap.get(id) || [];
    
    if (deps.length === 0 && dependents.length === 0) {
      orphans.push({ ...item, id, children: [], level: 0 });
    }
  });
  
  return {
    roots,
    dependencyChains,
    circularDeps,
    orphans
  };
}

function buildDependencyChain(itemId, parentItem, level, visited, dependencyMap, reverseDependencyMap, itemMap) {
  visited.add(itemId);
  const children = [];
  
  // Find direct dependents (resources that depend on this item)
  const dependents = reverseDependencyMap.get(itemId) || [];
  dependents.forEach(depId => {
    if (!visited.has(depId)) {
      const childItem = itemMap.get(depId);
      if (childItem) {
        const child = { ...childItem, id: depId, children: [], level: level + 1 };
        buildDependencyChain(depId, child, level + 1, visited, dependencyMap, reverseDependencyMap, itemMap);
        children.push(child);
      }
    }
  });
  
  parentItem.children = children;
}

function createRelationshipSection(title, items, description) {
  const section = document.createElement('div');
  section.className = 'relationship-section';
  section.style.cssText = `
    margin-bottom: 24px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  `;

  // Section header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-bottom: 1px solid #e2e8f0;
    cursor: pointer;
    transition: all 0.2s ease;
  `;

  const headerContent = document.createElement('div');
  headerContent.style.cssText = `
    display: flex;
    align-items: center;
    gap: 16px;
  `;

  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
    flex-shrink: 0;
  `;
  // Set icon based on section type
  if (title.includes('Foundation')) {
    icon.textContent = '●';
  } else if (title.includes('Dependency Chains')) {
    icon.textContent = '→';
  } else if (title.includes('Circular')) {
    icon.textContent = '↻';
  } else if (title.includes('Independent')) {
    icon.textContent = '○';
  } else {
    icon.textContent = '■';
  }

  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = `
    flex: 1;
  `;

  const titleText = document.createElement('div');
  titleText.style.cssText = `
    font-weight: 700;
    color: #1e293b;
    font-size: 18px;
    margin-bottom: 4px;
  `;
  titleText.textContent = title;

  const descText = document.createElement('div');
  descText.style.cssText = `
    color: #64748b;
    font-size: 14px;
    line-height: 1.4;
  `;
  descText.textContent = description;

  const countText = document.createElement('div');
  countText.style.cssText = `
    color: #3b82f6;
    font-size: 14px;
    font-weight: 600;
    background: #dbeafe;
    padding: 4px 12px;
    border-radius: 20px;
  `;
  countText.textContent = `${items.length} resource${items.length !== 1 ? 's' : ''}`;

  titleDiv.appendChild(titleText);
  titleDiv.appendChild(descText);

  headerContent.appendChild(icon);
  headerContent.appendChild(titleDiv);
  headerContent.appendChild(countText);

  const expandIcon = document.createElement('div');
  expandIcon.style.cssText = `
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    font-size: 16px;
    transition: transform 0.2s ease;
    margin-left: 16px;
  `;
  expandIcon.textContent = '▼';

  header.appendChild(headerContent);
  header.appendChild(expandIcon);

  // Content area
  const content = document.createElement('div');
  content.className = 'relationship-content';
  content.style.cssText = `
    display: block;
    padding: 0;
  `;

  // Render relationship tree recursively
  function renderRelationshipItem(item, level = 0) {
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = `
      padding: 12px 20px 12px ${20 + level * 24}px;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
      background: ${level % 2 === 0 ? '#ffffff' : '#f8fafc'};
    `;

    // Add visual hierarchy indicators
    if (level > 0) {
      // Vertical line
      const vLine = document.createElement('div');
      vLine.style.cssText = `
        position: absolute;
        left: ${20 + (level - 1) * 24 + 8}px;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #e2e8f0;
      `;
      itemDiv.appendChild(vLine);
      
      // Horizontal line
      const hLine = document.createElement('div');
      hLine.style.cssText = `
        position: absolute;
        left: ${20 + (level - 1) * 24 + 8}px;
        top: 50%;
        width: 12px;
        height: 2px;
        background: #e2e8f0;
      `;
      itemDiv.appendChild(hLine);
    }

    // Resource icon with relationship indicator
    const itemIcon = document.createElement('div');
    itemIcon.style.cssText = `
      width: 36px;
      height: 36px;
      background: ${getRelationshipColor(item, level)};
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 16px;
      font-weight: bold;
      flex-shrink: 0;
      position: relative;
    `;
    itemIcon.textContent = getResourceIcon(item.type);

    // Add relationship indicator
    if (item.children && item.children.length > 0) {
      const indicator = document.createElement('div');
      indicator.style.cssText = `
        position: absolute;
        top: -4px;
        right: -4px;
        width: 16px;
        height: 16px;
        background: #10b981;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 10px;
        font-weight: bold;
      `;
      indicator.textContent = item.children.length;
      itemIcon.appendChild(indicator);
    }

    // Resource info
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = `
      flex: 1;
      min-width: 0;
    `;

    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
      font-size: 15px;
      color: #1e293b;
      font-weight: 600;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    nameDiv.textContent = item.type ? `${item.type}.${item.name}` : `module.${item.name}`;

    const detailsDiv = document.createElement('div');
    detailsDiv.style.cssText = `
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #64748b;
      flex-wrap: wrap;
    `;

    // Level indicator
    if (level > 0) {
      const levelSpan = document.createElement('span');
      levelSpan.style.cssText = 'color: #8b5cf6; font-weight: 500;';
      levelSpan.textContent = `Level ${level}`;
      detailsDiv.appendChild(levelSpan);
    }

    // Line number
    if (item.line) {
      const lineSpan = document.createElement('span');
      lineSpan.textContent = `Line ${item.line}`;
      detailsDiv.appendChild(lineSpan);
    }

    // Dependencies count
    if (item.depends_on && item.depends_on.length > 0) {
      const depsSpan = document.createElement('span');
      depsSpan.style.cssText = 'color: #f59e0b; font-weight: 500;';
      depsSpan.textContent = `← ${item.depends_on.length} deps`;
      detailsDiv.appendChild(depsSpan);
    }

    // Dependents count
    if (item.children && item.children.length > 0) {
      const dependentsSpan = document.createElement('span');
      dependentsSpan.style.cssText = 'color: #10b981; font-weight: 500;';
      dependentsSpan.textContent = `→ ${item.children.length} dependents`;
      detailsDiv.appendChild(dependentsSpan);
    }

    // References count
    if (item.references && item.references.length > 0) {
      const refsSpan = document.createElement('span');
      refsSpan.style.cssText = 'color: #8b5cf6; font-weight: 500;';
      refsSpan.textContent = `${item.references.length} refs`;
      detailsDiv.appendChild(refsSpan);
    }

    // Circular dependency indicator
    if (item.isCircular) {
      const circularSpan = document.createElement('span');
      circularSpan.style.cssText = 'color: #ef4444; font-weight: 500; background: #fef2f2; padding: 2px 6px; border-radius: 4px;';
      circularSpan.textContent = 'Circular';
      detailsDiv.appendChild(circularSpan);
    }

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(detailsDiv);

    itemDiv.appendChild(itemIcon);
    itemDiv.appendChild(infoDiv);

    // Hover effects
    itemDiv.addEventListener('mouseenter', () => {
      itemDiv.style.background = '#f0f9ff';
      itemDiv.style.borderLeft = '4px solid #3b82f6';
    });
    itemDiv.addEventListener('mouseleave', () => {
      itemDiv.style.background = level % 2 === 0 ? '#ffffff' : '#f8fafc';
      itemDiv.style.borderLeft = '4px solid transparent';
    });

    // Click handler
    itemDiv.addEventListener('click', () => {
      if (item.type) {
        showResourceDetails(item);
      } else {
        showModuleDetails(item);
      }
    });

    content.appendChild(itemDiv);

    // Render children recursively
    if (item.children && item.children.length > 0) {
      item.children.forEach(child => {
        renderRelationshipItem(child, level + 1);
      });
    }
  }

  // Render all items
  items.forEach(item => {
    renderRelationshipItem(item);
  });

  section.appendChild(header);
  section.appendChild(content);

  // Toggle functionality
  header.addEventListener('click', () => {
    const isExpanded = content.style.display === 'block';
    content.style.display = isExpanded ? 'none' : 'block';
    expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
  });

  return section;
}

function getRelationshipColor(item, level) {
  if (item.isCircular) return '#ef4444'; // Red for circular dependencies
  
  if (level === 0) return '#10b981'; // Green for root/foundation resources
  if (level === 1) return '#3b82f6'; // Blue for first-level dependencies
  if (level === 2) return '#8b5cf6'; // Purple for second-level dependencies
  if (level >= 3) return '#f59e0b'; // Amber for deeper levels
  
  return '#6b7280'; // Gray for others
}

function getResourceColor(type) {
  if (!type) return '#f97316'; // Orange for modules
  
  const t = type.toLowerCase();
  if (t.includes('vpc') || t.includes('subnet') || t.includes('route')) return '#3b82f6'; // Blue
  if (t.includes('instance') || t.includes('lambda') || t.includes('ecs')) return '#10b981'; // Green
  if (t.includes('s3') || t.includes('ebs') || t.includes('efs')) return '#f59e0b'; // Amber
  if (t.includes('iam') || t.includes('security') || t.includes('kms')) return '#ef4444'; // Red
  if (t.includes('rds') || t.includes('dynamodb') || t.includes('database')) return '#8b5cf6'; // Purple
  if (t.includes('cloudwatch') || t.includes('sns') || t.includes('sqs')) return '#06b6d4'; // Cyan
  return '#6b7280'; // Gray
}

function getResourceIcon(type) {
  if (!type) return 'M';
  
  const t = type.toLowerCase();
  if (t.includes('vpc') || t.includes('subnet')) return 'N';
  if (t.includes('instance') || t.includes('ec2')) return 'C';
  if (t.includes('lambda') || t.includes('function')) return 'L';
  if (t.includes('s3') || t.includes('bucket')) return 'S';
  if (t.includes('rds') || t.includes('database')) return 'D';
  if (t.includes('iam') || t.includes('role')) return 'I';
  if (t.includes('cloudwatch') || t.includes('monitoring')) return 'M';
  if (t.includes('security') || t.includes('kms')) return 'K';
  return 'R';
}

function buildDependencyGraph(resources, modules) {
  const elements = [];
  const dependencyMap = new Map();
  const impactMap = new Map();
  
  // Create nodes
  resources.forEach(res => {
    const nodeId = res.type + '.' + res.name;
    elements.push({ 
      data: { 
        id: nodeId, 
        label: res.type + '\n' + res.name, 
        type: 'resource', 
        resourceType: res.type,
        depends_on: res.depends_on,
        references: res.references
      } 
    });
    dependencyMap.set(nodeId, res);
  });
  
  modules.forEach(mod => {
    const nodeId = 'module.' + mod.name;
    elements.push({ 
      data: { 
        id: nodeId, 
        label: 'module\n' + mod.name, 
        type: 'module',
        depends_on: mod.depends_on,
        references: mod.references
      } 
    });
    dependencyMap.set(nodeId, mod);
  });
  
  // Create edges for dependencies
  const allItems = [...resources, ...modules];
  allItems.forEach(item => {
    const sourceId = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    
    // Add explicit dependencies (depends_on)
    (item.depends_on || []).forEach(dep => {
      if (dependencyMap.has(dep)) {
        elements.push({
          data: {
            id: 'edge-' + sourceId + '-' + dep,
            source: dep,
            target: sourceId,
            relationshipType: 'explicit',
            label: 'depends_on'
          }
        });
      }
    });
    
    // Add implicit dependencies (references)
    (item.references || []).forEach(ref => {
      if (dependencyMap.has(ref)) {
        elements.push({
          data: {
            id: 'edge-' + sourceId + '-' + ref,
            source: ref,
            target: sourceId,
            relationshipType: 'implicit',
            label: 'references'
          }
        });
      }
    });
  });
  
  // Build impact map for quick lookup
  buildImpactMap(elements, impactMap);
  
  console.log('buildDependencyGraph: Elements:', elements);
  console.log('buildDependencyGraph: Impact map built with', impactMap.size, 'entries');
  return { elements, dependencyMap, impactMap };
}

// Build a map of which resources would be impacted if a given resource is destroyed
function buildImpactMap(elements, impactMap) {
  const nodes = elements.filter(el => el.data.id && !el.data.source);
  const edges = elements.filter(el => el.data.source && el.data.target);
  
  // Create adjacency list
  const adjacencyList = new Map();
  nodes.forEach(node => {
    adjacencyList.set(node.data.id, []);
  });
  
  // Build adjacency list from edges
  edges.forEach(edge => {
    const source = edge.data.source;
    const target = edge.data.target;
    if (adjacencyList.has(source)) {
      adjacencyList.get(source).push(target);
    }
  });
  
  // Calculate impact for each node using DFS
  nodes.forEach(node => {
    const impacted = new Set();
    const visited = new Set();
    
    function dfs(currentNode) {
      if (visited.has(currentNode)) return;
      visited.add(currentNode);
      
      // Add all nodes that depend on this one
      edges.forEach(edge => {
        if (edge.data.source === currentNode) {
          const dependent = edge.data.target;
          impacted.add(dependent);
          dfs(dependent);
        }
      });
    }
    
    dfs(node.data.id);
    impactMap.set(node.data.id, Array.from(impacted));
  });
}

// Get all resources that would be impacted if a given resource is destroyed
function getImpactChain(resourceId, impactMap) {
  if (!impactMap) {
    console.log('getImpactChain: impactMap is undefined, returning empty array');
    return [];
  }
  return impactMap.get(resourceId) || [];
}

// Get direct dependencies of a resource
function getDirectDependencies(resourceId, elements) {
  const edges = elements.filter(el => el.data.source && el.data.target);
  return edges
    .filter(edge => edge.data.target === resourceId)
    .map(edge => ({
      source: edge.data.source,
      type: edge.data.relationshipType,
      label: edge.data.label
    }));
}

// Get resources that depend on a given resource
function getDependents(resourceId, elements) {
  const edges = elements.filter(el => el.data.source && el.data.target);
  return edges
    .filter(edge => edge.data.source === resourceId)
    .map(edge => ({
      target: edge.data.target,
      type: edge.data.relationshipType,
      label: edge.data.label
    }));
}

// Show impact analysis for a selected node
function showImpactAnalysis(node, dependencyData) {
  const nodeId = node.data('id');
  
  if (!dependencyData) {
    console.log('showImpactAnalysis: dependencyData is undefined');
    return;
  }
  
  const { impactMap, elements } = dependencyData;
  
  // Get impact chain
  const impactedResources = getImpactChain(nodeId, impactMap);
  const directDeps = getDirectDependencies(nodeId, elements);
  const dependents = getDependents(nodeId, elements);
  
  // Highlight impacted nodes in the graph
  highlightImpactChain(nodeId, impactedResources, cy);
  
  // Show the reset button when impact analysis is active
  const resetImpactBtn = document.querySelector('[title="Reset Impact Highlighting"]');
  if (resetImpactBtn) {
    resetImpactBtn.style.display = 'block';
  }
  
  // Show impact analysis in details panel
  const detailsDiv = document.querySelector('[data-graph-details]');
  const detailsContent = document.getElementById('details-content');
  
  if (detailsDiv && detailsContent) {
    const impactSection = document.createElement('div');
    impactSection.style.cssText = `
      margin-top: 16px;
      border-top: 1px solid #ddd;
      padding-top: 12px;
    `;
    
    impactSection.innerHTML = `
      <div style="margin-bottom: 12px;">
        <strong style="color: #000; font-size: 14px;">Impact Analysis</strong>
      </div>
      
      <div style="margin-bottom: 8px;">
        <div style="font-weight: 600; color: #000; margin-bottom: 4px;">Direct Dependencies (${directDeps.length}):</div>
        ${directDeps.length > 0 ? 
          directDeps.map(dep => `
            <div style="margin: 2px 0; padding: 4px 8px; background: #e3f2fd; border-radius: 3px; font-size: 12px; font-family: 'Courier New', monospace; color: #000;">
              ${dep.source} <span style="color: #666;">(${dep.type})</span>
            </div>
          `).join('') : 
          '<div style="color: #666; font-style: italic; font-size: 12px;">None</div>'
        }
      </div>
      
      <div style="margin-bottom: 8px;">
        <div style="font-weight: 600; color: #000; margin-bottom: 4px;">Resources That Depend On This (${dependents.length}):</div>
        ${dependents.length > 0 ? 
          dependents.map(dep => `
            <div style="margin: 2px 0; padding: 4px 8px; background: #fff3e0; border-radius: 3px; font-size: 12px; font-family: 'Courier New', monospace; color: #000;">
              ${dep.target} <span style="color: #666;">(${dep.type})</span>
            </div>
          `).join('') : 
          '<div style="color: #666; font-style: italic; font-size: 12px;">None</div>'
        }
      </div>
      
      <div style="margin-bottom: 8px;">
        <div style="font-weight: 600; color: #000; margin-bottom: 4px;">Impact Chain (${impactedResources.length} resources would be affected):</div>
        ${impactedResources.length > 0 ? 
          impactedResources.map(resourceId => `
            <div style="margin: 2px 0; padding: 4px 8px; background: #ffebee; border-radius: 3px; font-size: 12px; font-family: 'Courier New', monospace; color: #000;">
              ${resourceId}
            </div>
          `).join('') : 
          '<div style="color: #666; font-style: italic; font-size: 12px;">No resources would be affected</div>'
        }
      </div>
      
      <div style="margin-top: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 11px; color: #666;">
        <strong>Legend:</strong><br>
        • <span style="color: #FF5722;">Solid orange lines</span> = Explicit dependencies (depends_on)<br>
        • <span style="color: #9C27B0;">Dashed purple lines</span> = Implicit dependencies (references)<br>
        • <span style="color: #d32f2f;">Red highlighted nodes</span> = Would be affected if this resource is destroyed
      </div>
    `;
    
    // Append impact analysis to existing content
    detailsContent.appendChild(impactSection);
  }
}

// Highlight the impact chain in the graph
function highlightImpactChain(selectedNodeId, impactedResources, cy) {
  // Reset all node styling first
  cy.nodes().forEach(node => {
    const nodeType = node.data('type');
    const nodeLabel = node.data('label');
    
    if (nodeType === 'module') {
      node.style({
        'background-color': '#FF9800',
        'border-color': '#E65100',
        'border-width': 2,
        'font-size': '12px',
        'width': '60px',
        'height': '60px',
        'label': nodeLabel
      });
    } else {
      node.style({
        'background-color': '#4CAF50',
        'border-color': '#2E7D32',
        'border-width': 2,
        'font-size': '12px',
        'width': '60px',
        'height': '60px',
        'label': nodeLabel
      });
    }
  });
  
  // Highlight the selected node
  const selectedNode = cy.getElementById(selectedNodeId);
  if (selectedNode.length > 0) {
    selectedNode.style({
      'background-color': '#2196F3',
      'border-color': '#1976D2',
      'border-width': 4,
      'font-size': '14px',
      'width': '70px',
      'height': '70px'
    });
  }
  
  // Highlight impacted nodes
  impactedResources.forEach(resourceId => {
    const node = cy.getElementById(resourceId);
    if (node.length > 0) {
      node.style({
        'background-color': '#f44336',
        'border-color': '#d32f2f',
        'border-width': 3,
        'font-size': '13px',
        'width': '65px',
        'height': '65px'
      });
    }
  });
  
  // Highlight edges to impacted nodes
  cy.edges().forEach(edge => {
    const source = edge.data('source');
    const target = edge.data('target');
    
    if (source === selectedNodeId && impactedResources.includes(target)) {
      edge.style({
        'width': 6,
        'line-color': '#f44336',
        'target-arrow-color': '#f44336',
        'opacity': 1
      });
    }
  });
}

// No toolbar needed for clean tree view
function createGraphControls(container) {
  return null; // Disabled for clean tree view
  // Create unified toolbar at bottom
  const toolbarDiv = document.createElement('div');
  toolbarDiv.setAttribute('data-graph-toolbar', 'true');
  toolbarDiv.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 50px;
    background: linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0.98));
    border-top: 1px solid #ddd;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    z-index: 1000;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
  `;

  // Create legend controls at bottom left (where legend was)
  const legendControlsDiv = document.createElement('div');
  legendControlsDiv.setAttribute('data-legend-controls', 'true');
  legendControlsDiv.style.cssText = `
    position: absolute;
    bottom: 60px;
    left: 10px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 8px;
    font-size: 11px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    gap: 6px;
  `;

  // Legend toggle button
  const legendBtn = document.createElement('button');
  legendBtn.innerHTML = 'Legend';
  legendBtn.title = 'Toggle Legend';
  legendBtn.style.cssText = `
    width: 55px;
    height: 28px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
  `;
  legendBtn.onmouseover = () => legendBtn.style.background = '#f0f0f0';
  legendBtn.onmouseout = () => legendBtn.style.background = '#fff';
  legendBtn.onclick = () => {
    const content = document.getElementById('legend-content');
    const toggle = document.getElementById('legend-toggle');
    const legendDiv = document.querySelector('[data-graph-legend]');
    const legendControls = document.querySelector('[data-legend-controls]');
    if (content && toggle && legendDiv) {
      window.legendExpanded = !window.legendExpanded;
      content.style.display = window.legendExpanded ? 'block' : 'none';
      toggle.textContent = window.legendExpanded ? '▼' : '▶';
      
      // Move legend to top left when expanded, back to bottom left when collapsed
      if (window.legendExpanded) {
        legendDiv.style.bottom = 'auto';
        legendDiv.style.top = '10px';
        legendDiv.style.left = '10px';
        // Hide the legend controls when legend is expanded
        if (legendControls) {
          legendControls.style.display = 'none';
        }
      } else {
        legendDiv.style.top = 'auto';
        legendDiv.style.bottom = '60px';
        legendDiv.style.left = '10px';
        // Show the legend controls when legend is collapsed
        if (legendControls) {
          legendControls.style.display = 'flex';
        }
      }
    }
  };

  // Zoom in button
  const zoomInBtn = document.createElement('button');
  zoomInBtn.innerHTML = '+';
  zoomInBtn.title = 'Zoom In';
  zoomInBtn.style.cssText = `
    width: 28px;
    height: 28px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
  `;
  zoomInBtn.onmouseover = () => zoomInBtn.style.background = '#f0f0f0';
  zoomInBtn.onmouseout = () => zoomInBtn.style.background = '#fff';
  zoomInBtn.onclick = () => cy.zoom({ level: cy.zoom() * 1.2 });

  // Zoom out button
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.innerHTML = '−';
  zoomOutBtn.title = 'Zoom Out';
  zoomOutBtn.style.cssText = zoomInBtn.style.cssText;
  zoomOutBtn.onmouseover = () => zoomOutBtn.style.background = '#f0f0f0';
  zoomOutBtn.onmouseout = () => zoomOutBtn.style.background = '#fff';
  zoomOutBtn.onclick = () => cy.zoom({ level: cy.zoom() / 1.2 });

  legendControlsDiv.appendChild(legendBtn);
  legendControlsDiv.appendChild(zoomInBtn);
  legendControlsDiv.appendChild(zoomOutBtn);

  // Create professional legend
  const legendDiv = document.createElement('div');
  legendDiv.setAttribute('data-graph-legend', 'true');
  legendDiv.style.cssText = `
    position: absolute;
    bottom: 60px;
    left: 10px;
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    font-size: 11px;
    z-index: 1000;
    min-width: 160px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
  `;
  
  // Create collapsible legend content
  const legendContent = document.createElement('div');
  legendContent.id = 'legend-content';
  legendContent.innerHTML = `
    <div style="display: flex; align-items: center; margin: 4px 0; padding: 4px 0;">
      <div style="width: 14px; height: 14px; background: #f8fafc; border: 2px solid #3b82f6; border-radius: 4px; margin-right: 8px; box-shadow: 0 1px 3px rgba(59, 130, 246, 0.2);"></div>
      <span style="font-weight: 600; color: #1e40af; font-size: 11px;">Resources</span>
    </div>
    <div style="display: flex; align-items: center; margin: 4px 0; padding: 4px 0;">
      <div style="width: 14px; height: 14px; background: #fff7ed; border: 2px solid #f97316; transform: rotate(45deg); margin-right: 8px; box-shadow: 0 1px 3px rgba(249, 115, 22, 0.2);"></div>
      <span style="font-weight: 600; color: #c2410c; font-size: 11px;">Modules</span>
    </div>
    <div style="margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
      <div style="font-size: 10px; margin-bottom: 6px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Dependencies</div>
      <div style="display: flex; align-items: center; margin: 3px 0; padding: 2px 0;">
        <div style="width: 18px; height: 3px; background: #dc2626; border-radius: 2px; margin-right: 8px; box-shadow: 0 1px 2px rgba(220, 38, 38, 0.3);"></div>
        <span style="font-size: 10px; color: #64748b; font-weight: 500;">Explicit (depends_on)</span>
      </div>
      <div style="display: flex; align-items: center; margin: 3px 0; padding: 2px 0;">
        <div style="width: 18px; height: 2px; background: #7c3aed; border-top: 2px dashed #7c3aed; border-radius: 2px; margin-right: 8px; box-shadow: 0 1px 2px rgba(124, 58, 237, 0.3);"></div>
        <span style="font-size: 10px; color: #64748b; font-weight: 500;">Implicit (references)</span>
      </div>
      <div style="display: flex; align-items: center; margin: 3px 0; padding: 2px 0;">
        <div style="width: 18px; height: 3px; background: #059669; border-radius: 2px; margin-right: 8px; box-shadow: 0 1px 2px rgba(5, 150, 105, 0.3);"></div>
        <span style="font-size: 10px; color: #64748b; font-weight: 500;">User Drawn</span>
      </div>
    </div>
    <div id="draw-status" style="margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; color: #64748b;">
      <span id="draw-status-text" style="font-weight: 500;">Draw mode: Inactive</span>
    </div>
    <div style="margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; color: #64748b;">
      <div style="font-weight: 600; margin-bottom: 6px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Layouts</div>
      <div style="margin: 2px 0; font-weight: 500;">Tree: Hierarchical structure</div>
      <div style="margin: 2px 0; font-weight: 500;">Force: Dynamic positioning</div>
      <div style="margin: 2px 0; font-weight: 500;">Grid: Organized alignment</div>
    </div>
  `;
  
  // Create legend header with toggle
  const legendHeader = document.createElement('div');
  legendHeader.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-weight: bold;
    margin-bottom: 4px;
    user-select: none;
  `;
  legendHeader.innerHTML = `
    <span>Legend</span>
    <span id="legend-toggle" style="font-size: 10px; color: #666;">▶</span>
  `;
  
  // Add toggle functionality
  legendHeader.onclick = () => {
    window.legendExpanded = !window.legendExpanded;
    const content = document.getElementById('legend-content');
    const toggle = document.getElementById('legend-toggle');
    const legendDiv = document.querySelector('[data-graph-legend]');
    const legendControls = document.querySelector('[data-legend-controls]');
    if (content && toggle && legendDiv) {
      content.style.display = window.legendExpanded ? 'block' : 'none';
      toggle.textContent = window.legendExpanded ? '▼' : '▶';
      
      // Move legend to top left when expanded, back to bottom left when collapsed
      if (window.legendExpanded) {
        legendDiv.style.bottom = 'auto';
        legendDiv.style.top = '10px';
        legendDiv.style.left = '10px';
        // Hide the legend controls when legend is expanded
        if (legendControls) {
          legendControls.style.display = 'none';
        }
      } else {
        legendDiv.style.top = 'auto';
        legendDiv.style.bottom = '60px';
        legendDiv.style.left = '10px';
        // Show the legend controls when legend is collapsed
        if (legendControls) {
          legendControls.style.display = 'flex';
        }
      }
    }
  };
  
  legendDiv.appendChild(legendHeader);
  legendDiv.appendChild(legendContent);
  
  // Set legend to be closed by default
  const content = document.getElementById('legend-content');
  if (content) {
    content.style.display = 'none';
  }

  // Set legend toggle to closed state
  const toggle = document.getElementById('legend-toggle');
  if (toggle) {
    toggle.textContent = '▶';
  }
  
  // Also set the global state to closed
  window.legendExpanded = false;
  
  // Ensure legend stays closed on any state changes
  setTimeout(() => {
    const content = document.getElementById('legend-content');
    const toggle = document.getElementById('legend-toggle');
    if (content && toggle) {
      content.style.display = 'none';
      toggle.textContent = '▶';
      window.legendExpanded = false;
    }
  }, 100);

  // Create left section (empty for now)
  const leftSection = document.createElement('div');
  leftSection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // Create center section (mode controls)
  const centerSection = document.createElement('div');
  centerSection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // Pan mode toggle
  const panBtn = document.createElement('button');
  panBtn.innerHTML = 'Pan';
  panBtn.title = 'Pan Mode';
  panBtn.style.cssText = `
    width: 40px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
  `;
  panBtn.onmouseover = () => panBtn.style.background = '#f0f0f0';
  panBtn.onmouseout = () => panBtn.style.background = '#fff';
  panBtn.onclick = () => {
    const isPanning = cy.panningEnabled();
    cy.panningEnabled(!isPanning);
    panBtn.style.background = !isPanning ? '#e0e0e0' : '#fff';
    panBtn.title = !isPanning ? 'Disable Pan' : 'Pan Mode';
  };

  // Draw mode toggle
  const drawBtn = document.createElement('button');
  drawBtn.innerHTML = 'Draw';
  drawBtn.title = 'Draw Relationships';
  drawBtn.style.cssText = `
    width: 40px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
  `;
  drawBtn.onclick = () => {
    const isDrawing = drawBtn.classList.contains('active');
    if (isDrawing) {
      // Exit draw mode
      drawBtn.classList.remove('active');
      drawBtn.style.background = '#fff';
      drawBtn.title = 'Draw Relationships';
      container.style.cursor = 'default';
      
      // Reset any highlighted nodes - preserve labels
      cy.nodes().forEach(node => {
        const nodeType = node.data('type');
        const nodeLabel = node.data('label'); // Preserve the original label
        
        if (nodeType === 'module') {
          node.style({
            'background-color': '#FF9800',
            'border-color': '#E65100',
            'shape': 'diamond',
            'width': '60px',
            'height': '60px',
            'label': nodeLabel, // Use the preserved label
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'text-outline-color': '#000',
            'text-outline-width': 1,
            'text-outline-opacity': 0.5
          });
        } else {
          node.style({
            'background-color': '#4CAF50',
            'border-color': '#2E7D32',
            'shape': 'rectangle',
            'width': '60px',
            'height': '60px',
            'label': nodeLabel, // Use the preserved label
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'text-outline-color': '#000',
            'text-outline-width': 1,
            'text-outline-opacity': 0.5
          });
        }
      });
      
      // Reset drawing state
      drawingStartNode = null;
      console.log('Draw mode: Disabled');
      
      // Update status indicator
      const statusText = document.getElementById('draw-status-text');
      if (statusText) {
        statusText.textContent = 'Draw mode: Inactive';
        statusText.style.color = '#666';
      }
    } else {
      // Enter draw mode
      drawBtn.classList.add('active');
      drawBtn.style.background = '#e0e0e0';
      drawBtn.title = 'Exit Draw Mode';
      container.style.cursor = 'crosshair';
      console.log('Draw mode: Enabled - Click on nodes to create relationships');
      
      // Close legend when entering draw mode
      const content = document.getElementById('legend-content');
      const toggle = document.getElementById('legend-toggle');
      if (content && toggle) {
        content.style.display = 'none';
        toggle.textContent = '▶';
        legendExpanded = false;
      }
      
      // Update status indicator
      const statusText = document.getElementById('draw-status-text');
      if (statusText) {
        statusText.textContent = 'Draw mode: Active - Click nodes to create relationships';
        statusText.style.color = '#2196F3';
      }
    }
  };

  drawBtn.onmouseover = () => drawBtn.style.background = '#f0f0f0';
  drawBtn.onmouseout = () => drawBtn.style.background = '#fff';
  drawBtn.onclick = () => {
    const isDrawing = drawBtn.classList.contains('active');
    if (isDrawing) {
      // Exit draw mode
      drawBtn.classList.remove('active');
      drawBtn.style.background = '#fff';
      drawBtn.title = 'Draw Relationships';
      container.style.cursor = 'default';
      
      // Reset any highlighted nodes - preserve labels
      cy.nodes().forEach(node => {
        const nodeType = node.data('type');
        const nodeLabel = node.data('label'); // Preserve the original label
        
        if (nodeType === 'module') {
          node.style({
            'background-color': '#FF9800',
            'border-color': '#E65100',
            'shape': 'diamond',
            'width': '60px',
            'height': '60px',
            'label': nodeLabel, // Use the preserved label
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'text-outline-color': '#000',
            'text-outline-width': 1,
            'text-outline-opacity': 0.5
          });
        } else {
          node.style({
            'background-color': '#4CAF50',
            'border-color': '#2E7D32',
            'shape': 'rectangle',
            'width': '60px',
            'height': '60px',
            'label': nodeLabel, // Use the preserved label
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'text-outline-color': '#000',
            'text-outline-width': 1,
            'text-outline-opacity': 0.5
          });
        }
      });
      
      // Reset drawing state
      drawingStartNode = null;
      console.log('Draw mode: Disabled');
      
      // Update status indicator
      const statusText = document.getElementById('draw-status-text');
      if (statusText) {
        statusText.textContent = 'Draw mode: Inactive';
        statusText.style.color = '#666';
      }
    } else {
      // Enter draw mode
      drawBtn.classList.add('active');
      drawBtn.style.background = '#e0e0e0';
      drawBtn.title = 'Exit Draw Mode';
      container.style.cursor = 'crosshair';
      console.log('Draw mode: Enabled - Click on nodes to create relationships');
      
      // Close legend when entering draw mode
      const content = document.getElementById('legend-content');
      const toggle = document.getElementById('legend-toggle');
      if (content && toggle) {
        content.style.display = 'none';
        toggle.textContent = '▶';
        legendExpanded = false;
      }
      
      // Update status indicator
      const statusText = document.getElementById('draw-status-text');
      if (statusText) {
        statusText.textContent = 'Draw mode: Active - Click nodes to create relationships';
        statusText.style.color = '#2196F3';
      }
    }
  };

  // Clear all relationships button
  const clearBtn = document.createElement('button');
  clearBtn.innerHTML = 'Clear';
  clearBtn.title = 'Clear All Relationships';
  clearBtn.style.cssText = `
    width: 45px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
  `;
  clearBtn.onmouseover = () => clearBtn.style.background = '#f0f0f0';
  clearBtn.onmouseout = () => clearBtn.style.background = '#fff';
  clearBtn.onclick = () => {
          if (confirm('Clear all drawn relationships?')) {
        cy.elements('edge').remove();
        clearGraph();
        // Test save after clearing
        setTimeout(() => {
          console.log('Testing save after clear...');
          saveGraph();
        }, 100);
      }
  };
  
  // Reset view button
  const resetBtn = document.createElement('button');
  resetBtn.innerHTML = 'Home';
  resetBtn.title = 'Reset View';
  resetBtn.style.cssText = `
    width: 45px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
  `;
  resetBtn.onmouseover = () => resetBtn.style.background = '#f0f0f0';
  resetBtn.onmouseout = () => resetBtn.style.background = '#fff';
  resetBtn.onclick = () => {
    cy.fit();
    cy.center();
  };

  centerSection.appendChild(resetBtn);
  centerSection.appendChild(panBtn);
  centerSection.appendChild(drawBtn);
  centerSection.appendChild(clearBtn);

  // Reset impact highlighting button (hidden by default)
  const resetImpactBtn = document.createElement('button');
  resetImpactBtn.innerHTML = 'Reset';
  resetImpactBtn.title = 'Reset Impact Highlighting';
  resetImpactBtn.style.cssText = zoomInBtn.style.cssText + '; display: none;';
  resetImpactBtn.onclick = () => {
    // Reset all node styling
    cy.nodes().forEach(node => {
      const nodeType = node.data('type');
      const nodeLabel = node.data('label');
      
      if (nodeType === 'module') {
        node.style({
          'background-color': '#FF9800',
          'border-color': '#E65100',
          'border-width': 2,
          'font-size': '12px',
          'width': '60px',
          'height': '60px',
          'label': nodeLabel
        });
      } else {
        node.style({
          'background-color': '#4CAF50',
          'border-color': '#2E7D32',
          'border-width': 2,
          'font-size': '12px',
          'width': '60px',
          'height': '60px',
          'label': nodeLabel
        });
      }
    });
    
    // Reset edge styling
    cy.edges().forEach(edge => {
      const relationshipType = edge.data('relationshipType');
      if (relationshipType === 'explicit') {
        edge.style({
          'width': 4,
          'line-color': '#FF5722',
          'target-arrow-color': '#FF5722',
          'opacity': 0.9
        });
      } else if (relationshipType === 'implicit') {
        edge.style({
          'width': 2,
          'line-color': '#9C27B0',
          'target-arrow-color': '#9C27B0',
          'opacity': 0.6
        });
      } else {
        edge.style({
          'width': 3,
          'line-color': '#9C27B0',
          'target-arrow-color': '#9C27B0',
          'opacity': 0.8
        });
      }
    });
    
    // Clear impact analysis from details panel
    const detailsContent = document.getElementById('details-content');
    if (detailsContent) {
      const impactSection = detailsContent.querySelector('[style*="border-top: 1px solid #ddd"]');
      if (impactSection) {
        impactSection.remove();
      }
    }
    
    // Hide the reset button
    resetImpactBtn.style.display = 'none';
  };
  


  // Create right section (layout controls)
  const rightSection = document.createElement('div');
  rightSection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // Layout buttons
  const treeBtn = document.createElement('button');
  treeBtn.innerHTML = 'Tree';
  treeBtn.title = 'Hierarchical Tree Layout';
  treeBtn.style.cssText = `
    width: 40px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
  `;
  treeBtn.onmouseover = () => treeBtn.style.background = '#f0f0f0';
  treeBtn.onmouseout = () => treeBtn.style.background = '#fff';
  treeBtn.onclick = () => {
    applyHierarchicalLayout(cy);
  };

  const forceBtn = document.createElement('button');
  forceBtn.innerHTML = 'Force';
  forceBtn.title = 'Force-Directed Layout';
  forceBtn.style.cssText = treeBtn.style.cssText;
  forceBtn.onmouseover = () => forceBtn.style.background = '#f0f0f0';
  forceBtn.onmouseout = () => forceBtn.style.background = '#fff';
  forceBtn.onclick = () => {
    cy.layout({
      name: 'cose',
      idealEdgeLength: 120,
      nodeOverlap: 30,
      refresh: 20,
      fit: true,
      padding: 30,
      randomize: false,
      componentSpacing: 100,
      nodeRepulsion: 400000,
      gravity: 80,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0
    }).run();
  };

  const gridBtn = document.createElement('button');
  gridBtn.innerHTML = 'Grid';
  gridBtn.title = 'Grid Layout';
  gridBtn.style.cssText = treeBtn.style.cssText;
  gridBtn.onmouseover = () => gridBtn.style.background = '#f0f0f0';
  gridBtn.onmouseout = () => gridBtn.style.background = '#fff';
  gridBtn.onclick = () => {
    cy.layout({
      name: 'grid',
      fit: true,
      padding: 30,
      animate: true,
      animationDuration: 1000
    }).run();
  };

  rightSection.appendChild(treeBtn);
  rightSection.appendChild(forceBtn);
  rightSection.appendChild(gridBtn);

  // Add sections to toolbar
  toolbarDiv.appendChild(leftSection);
  toolbarDiv.appendChild(centerSection);
  toolbarDiv.appendChild(rightSection);

  // Create status indicator for auto-save
  const statusDiv = document.createElement('div');
  statusDiv.id = 'canvas-status';
  statusDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 9999;
    display: none;
    transition: opacity 0.3s ease;
  `;
  statusDiv.textContent = 'Auto-saved';
  
  // Create details panel as a modal
  const detailsDiv = document.createElement('div');
  detailsDiv.setAttribute('data-graph-details', 'true');
  detailsDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 2px solid #ddd;
    border-radius: 8px;
    padding: 0;
    font-size: 14px;
    z-index: 10000;
    width: 400px;
    max-height: 80vh;
    display: none;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  
  detailsDiv.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #f8f9fa; border-bottom: 1px solid #ddd; border-radius: 8px 8px 0 0;">
      <span style="font-weight: bold; color: #333; font-size: 16px;">Resource Details</span>
      <button id="close-details" style="background: none; border: none; color: #666; cursor: pointer; font-size: 18px; font-weight: bold; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">×</button>
    </div>
    <div id="details-content" style="padding: 16px; max-height: calc(80vh - 60px); overflow-y: auto; font-size: 13px; line-height: 1.5;">
      Click on a node to see details
    </div>
  `;
  
  // Add close functionality
  const closeBtn = detailsDiv.querySelector('#close-details');
  if (closeBtn) {
    closeBtn.onclick = () => {
      detailsDiv.style.display = 'none';
    };
  }
  
  // Add backdrop click to close
  detailsDiv.addEventListener('click', (e) => {
    if (e.target === detailsDiv) {
      detailsDiv.style.display = 'none';
    }
  });

  return { controls: toolbarDiv, legend: legendDiv, legendControls: legendControlsDiv, details: detailsDiv, status: statusDiv };
}

function copyToClipboard(text) {
  try {
    // Try the modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback();
      }).catch(() => {
        // Fallback to execCommand
        fallbackCopy(text);
      });
    } else {
      // Fallback to execCommand
      fallbackCopy(text);
    }
  } catch (error) {
    console.error('Copy failed:', error);
    // Show error feedback
    const button = document.querySelector('[onclick*="copyToClipboard"]');
    if (button) {
      button.textContent = 'Copy Failed';
      button.style.background = '#dc3545';
      setTimeout(() => {
        button.textContent = 'Copy Resource ID';
        button.style.background = '#007bff';
      }, 2000);
    }
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showCopyFeedback();
    } else {
      throw new Error('execCommand failed');
    }
  } catch (error) {
    console.error('Fallback copy failed:', error);
  } finally {
    document.body.removeChild(textarea);
  }
}

function showCopyFeedback() {
  const button = document.querySelector('[onclick*="copyToClipboard"]');
  if (button) {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.style.background = '#28a745';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '#007bff';
    }, 1000);
  }
}

function showNodeDetails(node) {
  const detailsDiv = document.querySelector('[data-graph-details]');
  const detailsContent = document.getElementById('details-content');
  
  if (!detailsDiv || !detailsContent) return;
  
  const nodeType = node.data('type');
  const nodeId = node.data('id');
  
  if (nodeType === 'resource') {
    // Extract resource type and name from ID
    const [resourceType, resourceName] = nodeId.split('.');
    
    // Find the resource in the parsed data
    const content = collectCodeText();
    const { resources } = parseHCL(content);
    const resource = resources.find(r => r.type + '.' + r.name === nodeId);
    
    // Find all instances of the same resource type
    const allInstancesOfType = resources.filter(r => r.type === resourceType);
    
    if (resource) {
      const docLink = getProviderDocUrl(resource.type);
      
      // Check for missing required attributes
      const req = requiredAttributes[resource.type] || [];
      const missingAttrs = req.filter(a => !resource.attributes.some(attr => attr.name === a));
      const hasMissing = missingAttrs.length > 0;
      
      // Categorize attributes
      const commonAttrs = ['name', 'tags', 'description', 'environment', 'project'];
      const securityAttrs = ['encryption', 'ssl', 'https', 'tls', 'certificate', 'key', 'secret', 'password'];
      const networkAttrs = ['subnet', 'vpc', 'cidr', 'port', 'protocol', 'ingress', 'egress', 'route'];
      
      const categorizeAttr = (attrName) => {
        if (commonAttrs.some(c => attrName.toLowerCase().includes(c))) return 'common';
        if (securityAttrs.some(s => attrName.toLowerCase().includes(s))) return 'security';
        if (networkAttrs.some(n => attrName.toLowerCase().includes(n))) return 'network';
        return 'other';
      };
      
      const categorizedAttrs = resource.attributes.reduce((acc, attr) => {
        const category = categorizeAttr(attr.name);
        if (!acc[category]) acc[category] = [];
        acc[category].push(attr);
        return acc;
      }, {});
      
      detailsContent.innerHTML = `
        <div style="margin-bottom: 12px; font-size: 14px;">
          <strong style="color: #000;">Type:</strong> <span style="color: #000; font-family: 'Courier New', monospace; font-weight: bold; font-size: 14px; background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${resource.type}</span>
        </div>
        <div style="margin-bottom: 12px; font-size: 14px;">
          <strong style="color: #000;">Name:</strong> <span style="color: #000; font-family: 'Courier New', monospace; font-weight: bold; font-size: 14px; background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${resource.name}</span>
        </div>
        ${hasMissing ? `
                 <div style="margin-bottom: 16px; padding: 12px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px;">
           <strong style="color: #000;">Missing Required Attributes:</strong>
           <div style="margin-top: 8px;">
             ${missingAttrs.map(attr => '<div style="margin: 2px 0; color: #000;">• ' + attr + '</div>').join('')}
           </div>
         </div>
        ` : ''}
        <div style="margin-bottom: 16px;">
          <strong>Attributes (${resource.attributes.length}):</strong>
          ${Object.entries(categorizedAttrs).map(([category, attrs]) => `
            <div style="margin-top: 12px;">
                                            <div style="font-weight: 600; color: #000; margin-bottom: 6px; text-transform: uppercase; font-size: 11px;">
                 ${category === 'common' ? 'Common' : 
                   category === 'security' ? 'Security' : 
                   category === 'network' ? 'Network' : 'Other'}
              </div>
              <div style="margin-left: 8px;">
                                ${attrs.map(attr => `
                  <div style="margin: 3px 0; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid ${
                    category === 'common' ? '#28a745' : 
                    category === 'security' ? '#dc3545' : 
                    category === 'network' ? '#007bff' : '#6c757d'
                  }; font-family: 'Courier New', monospace; font-size: 12px; font-weight: 500; color: #000;">
                    <div style="font-weight: bold; margin-bottom: 2px;">${attr.name}</div>
                    <div style="color: #666; font-size: 11px; word-break: break-all;">${attr.value}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        ${resource.depends_on && resource.depends_on.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <strong style="color: #000; margin-bottom: 8px; display: block;">Dependencies (${resource.depends_on.length}):</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${resource.depends_on.map(dep => `
                <span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'Courier New', monospace;">${dep}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${resource.references && resource.references.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <strong style="color: #000; margin-bottom: 8px; display: block;">References (${resource.references.length}):</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${resource.references.map(ref => `
                <span style="background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'Courier New', monospace;">${ref}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${allInstancesOfType.length > 1 ? `
          <div style="margin-bottom: 16px;">
            <strong style="color: #000; margin-bottom: 8px; display: block;">All Instances of ${resourceType} (${allInstancesOfType.length}):</strong>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px;">
              ${allInstancesOfType.map(instance => `
                <div style="padding: 8px 12px; margin: 4px 0; background: ${instance.name === resource.name ? '#f0f9ff' : '#f8f9fa'}; border-radius: 4px; border-left: 3px solid ${instance.name === resource.name ? '#3b82f6' : '#d1d5db'};">
                  <div style="font-weight: 600; color: #000; font-family: 'Courier New', monospace; font-size: 12px;">${instance.name}</div>
                  <div style="color: #6b7280; font-size: 11px; margin-top: 2px;">
                    Line ${instance.line || 'Unknown'} • ${instance.attributes.length} attributes
                    ${instance.depends_on && instance.depends_on.length > 0 ? ` • ${instance.depends_on.length} deps` : ''}
                    ${instance.references && instance.references.length > 0 ? ` • ${instance.references.length} refs` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
                  <div style="margin-top: 16px; border-top: 1px solid #ddd; padding-top: 12px;">
            <div style="margin-bottom: 8px;">
              <strong style="color: #000; font-size: 12px;">Resource ID:</strong>
            </div>
            <input type="text" value="${resource.type}.${resource.name}" readonly style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 12px; background: #f8f9fa; color: #000;" onclick="this.select();">
            <div style="margin-top: 8px; text-align: right;">
              <a href="${docLink}" target="_blank" style="color: #007bff; text-decoration: none; font-size: 12px; font-weight: 500;">
                View Documentation
              </a>
            </div>
          </div>
      `;
    } else {
      detailsContent.innerHTML = `
        <div style="color: #666;">
          Resource details not found
        </div>
      `;
    }
  } else if (nodeType === 'module') {
    // Extract module name from ID
    const moduleName = nodeId.replace('module.', '');
    
    // Find the module in the parsed data
    const content = collectCodeText();
    const { modules } = parseHCL(content);
    const module = modules.find(m => m.name === moduleName);
    
    if (module) {
      detailsContent.innerHTML = `
        <div style="margin-bottom: 6px;">
          <strong>Type:</strong> Module
        </div>
        <div style="margin-bottom: 6px;">
          <strong>Name:</strong> ${module.name}
        </div>
        <div style="margin-bottom: 6px;">
          <strong>Source:</strong> ${module.source || 'Not specified'}
        </div>
        ${module.depends_on && module.depends_on.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <strong style="color: #000; margin-bottom: 8px; display: block;">Dependencies (${module.depends_on.length}):</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${module.depends_on.map(dep => `
                <span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'Courier New', monospace;">${dep}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${module.references && module.references.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <strong style="color: #000; margin-bottom: 8px; display: block;">References (${module.references.length}):</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${module.references.map(ref => `
                <span style="background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'Courier New', monospace;">${ref}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
      `;
    } else {
      detailsContent.innerHTML = `
        <div style="color: #666;">
          Module details not found
        </div>
      `;
    }
  }
  
  // Show the details panel
  detailsDiv.style.display = 'block';
}

function initCleanTreeView(resources, modules) {
  const container = document.getElementById('tf-graph');
  if (!container || !container.isConnected) return;

  // Store resources and modules globally for impact chain analysis
  window.tfResources = resources;
  window.tfModules = modules;

  // Clear existing content
  container.innerHTML = '';
  
  // Create clean tree container
  const treeContainer = document.createElement('div');
  treeContainer.id = 'tf-clean-tree';
  treeContainer.style.cssText = `
    height: 100%;
    background: #ffffff;
    border: none;
    border-radius: 0;
    margin: 0;
    position: relative;
    box-shadow: none;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  `;

  // Create header with search
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  // Search input with enhanced UX
  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = `
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  `;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search resources and modules... (Ctrl+F)';
  searchInput.setAttribute('aria-label', 'Search resources and modules');
  searchInput.setAttribute('role', 'searchbox');
  searchInput.style.cssText = `
    flex: 1;
    padding: 8px 12px 8px 40px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: white;
    font-family: inherit;
    transition: all 0.2s ease;
    outline: none;
  `;
  
  // Search icon
  const searchIcon = document.createElement('div');
  searchIcon.style.cssText = `
    position: absolute;
    left: 12px;
    color: #6b7280;
    font-size: 16px;
    pointer-events: none;
    z-index: 1;
  `;
  searchIcon.innerHTML = '🔍';
  
  // Clear search button
  const clearButton = document.createElement('button');
  clearButton.innerHTML = '✕';
  clearButton.setAttribute('aria-label', 'Clear search');
  clearButton.style.cssText = `
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 12px;
    display: none;
    transition: all 0.2s ease;
  `;
  clearButton.addEventListener('mouseenter', () => {
    clearButton.style.background = '#f3f4f6';
    clearButton.style.color = '#374151';
  });
  clearButton.addEventListener('mouseleave', () => {
    clearButton.style.background = 'none';
    clearButton.style.color = '#6b7280';
  });
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    filterCleanTree('', treeRoot);
    clearButton.style.display = 'none';
  });

  searchInput.addEventListener('focus', () => {
    searchInput.style.borderColor = '#3b82f6';
    searchInput.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
  });
  searchInput.addEventListener('blur', () => {
    searchInput.style.borderColor = '#d1d5db';
    searchInput.style.boxShadow = 'none';
  });
  searchInput.addEventListener('input', (e) => {
    const hasValue = e.target.value.length > 0;
    clearButton.style.display = hasValue ? 'block' : 'none';
  });

  searchContainer.appendChild(searchIcon);
  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(clearButton);

  // Stats display
  const statsDiv = document.createElement('div');
  statsDiv.style.cssText = `
    color: #6b7280;
    font-size: 12px;
    white-space: nowrap;
  `;
  statsDiv.textContent = resources.length + ' resources, ' + modules.length + ' modules';

  header.appendChild(searchContainer);
  header.appendChild(statsDiv);

  // Create scrollable tree area
  const treeArea = document.createElement('div');
  treeArea.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: #ffffff;
  `;

  // Build the clean tree structure
  const treeRoot = document.createElement('div');
  treeRoot.id = 'clean-tree-root';
  treeRoot.style.cssText = `
    padding: 0;
    margin: 0;
  `;

  // Show loading state if no resources
  if (resources.length === 0 && modules.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      color: #6b7280;
    `;
    emptyState.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 16px;">🌱</div>
      <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #374151;">No Terraform resources found</div>
      <div style="font-size: 14px;">Make sure you're on a page with Terraform files (.tf) or GitHub repository with Terraform code</div>
    `;
    treeRoot.appendChild(emptyState);
  } else {
    // Build dependency tree
    const dependencyTree = buildDependencyTree(resources, modules);
    
    // Render the tree
    renderDependencyTree(dependencyTree, treeRoot);
  }

  treeArea.appendChild(treeRoot);
  treeContainer.appendChild(header);
  treeContainer.appendChild(treeArea);
  container.appendChild(treeContainer);

  // Add search functionality with enhanced features
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterCleanTree(query, treeRoot);
  });

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+F or Cmd+F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    
    // Escape to clear search
    if (e.key === 'Escape' && searchInput === document.activeElement) {
      searchInput.value = '';
      filterCleanTree('', treeRoot);
      clearButton.style.display = 'none';
    }
  });

  // Add ARIA attributes for accessibility
  treeContainer.setAttribute('role', 'tree');
  treeContainer.setAttribute('aria-label', 'Terraform resources and modules tree');
}

// Context menu for resources
function showResourceContextMenu(event, resource) {
  // Remove existing context menu
  const existingMenu = document.getElementById('resource-context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  const menu = document.createElement('div');
  menu.id = 'resource-context-menu';
  menu.style.cssText = `
    position: fixed;
    top: ${event.clientY}px;
    left: ${event.clientX}px;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    min-width: 200px;
    padding: 8px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const menuItems = [
    {
      label: '📋 Copy Resource Name',
      action: () => copyToClipboard(resource.type + '.' + resource.name)
    },
    {
      label: '📋 Copy Resource Type',
      action: () => copyToClipboard(resource.type)
    },
    {
      label: '📖 View Documentation',
      action: () => openResourceDocs(resource.type)
    },
    {
      label: 'ℹ️ View Details',
      action: () => showResourceDetails(resource)
    }
  ];

  menuItems.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      transition: background-color 0.2s ease;
      font-size: 14px;
      color: #374151;
    `;
    menuItem.textContent = item.label;
    
    menuItem.addEventListener('mouseenter', () => {
      menuItem.style.background = '#f3f4f6';
    });
    
    menuItem.addEventListener('mouseleave', () => {
      menuItem.style.background = 'transparent';
    });
    
    menuItem.addEventListener('click', () => {
      item.action();
      menu.remove();
    });
    
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);

  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

// Utility functions
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard: ' + text);
  }).catch(() => {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showToast('Copied to clipboard: ' + text);
  });
}

function openResourceDocs(resourceType) {
  const url = getResourceDocsUrl(resourceType);
  window.open(url, '_blank');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10001;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  
  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => {
      toast.remove();
      style.remove();
    }, 300);
  }, 2000);
}

// Calculate impact chain - resources that would be affected if this resource changes
function calculateImpactChain(resource) {
  console.log('calculateImpactChain: Starting for resource:', resource);
  
  const impactChain = [];
  const visited = new Set();
  
  // Check if resources are available and are arrays
  if (!window.tfResources || !Array.isArray(window.tfResources) || 
      !window.tfModules || !Array.isArray(window.tfModules)) {
    console.log('calculateImpactChain: No valid global resources/modules found');
    return impactChain;
  }
  
  const allResources = [...window.tfResources, ...window.tfModules];
  console.log('calculateImpactChain: Total resources to check:', allResources.length);
  
  function findDependents(resourceId) {
    if (visited.has(resourceId)) return;
    visited.add(resourceId);
    
    console.log('calculateImpactChain: Finding dependents for:', resourceId);
    
    allResources.forEach(r => {
      // Check if this resource depends on the current one
      const dependsOn = r.depends_on || [];
      const references = r.references || [];
      
      if (dependsOn.includes(resourceId) || references.includes(resourceId)) {
        const resourceName = r.type ? `${r.type}.${r.name}` : `module.${r.name}`;
        console.log('calculateImpactChain: Found dependent:', resourceName);
        if (!impactChain.includes(resourceName)) {
          impactChain.push(resourceName);
          // Recursively find dependents of this resource
          findDependents(r.id);
        }
      }
    });
  }
  
  findDependents(resource.id);
  console.log('calculateImpactChain: Final impact chain:', impactChain);
  return impactChain;
}

// Enhanced resource details popup
function showResourceDetails(resource) {
  // Remove existing popup
  const existingPopup = document.getElementById('resource-details-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = document.createElement('div');
  popup.id = 'resource-details-popup';
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    z-index: 10000;
    max-width: 500px;
    width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: popupFadeIn 0.3s ease;
  `;

  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes popupFadeIn {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  `;
  document.head.appendChild(style);

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px 24px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 12px 12px 0 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 18px;
    font-weight: bold;
  `;
  icon.textContent = 'R';

  const titleText = document.createElement('div');
  titleText.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  `;
  titleText.textContent = resource.type + '.' + resource.name;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.setAttribute('aria-label', 'Close details');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    font-size: 16px;
    transition: all 0.2s ease;
  `;
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#f3f4f6';
    closeBtn.style.color = '#374151';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'none';
    closeBtn.style.color = '#6b7280';
  });
  closeBtn.addEventListener('click', () => {
    popup.remove();
    style.remove();
  });

  title.appendChild(icon);
  title.appendChild(titleText);
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 24px;
  `;

  // Resource type
  const typeSection = document.createElement('div');
  typeSection.style.cssText = `
    margin-bottom: 20px;
  `;
  typeSection.innerHTML = `
    <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Resource Type</div>
    <div style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 14px; color: #1f2937; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${resource.type}</div>
  `;

  // Resource name
  const nameSection = document.createElement('div');
  nameSection.style.cssText = `
    margin-bottom: 20px;
  `;
  nameSection.innerHTML = `
    <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Resource Name</div>
    <div style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 14px; color: #1f2937; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${resource.name}</div>
  `;

  // Resource attributes
  let attrsSection = null;
  if (resource.attributes && resource.attributes.length > 0) {
    attrsSection = document.createElement('div');
    attrsSection.style.cssText = `
      margin-bottom: 20px;
    `;
    attrsSection.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Attributes (${resource.attributes.length})</div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${resource.attributes.map(attr => `
          <div style="display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e5e7eb;">
            <div style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 12px; color: #6b7280; font-weight: 600; min-width: 120px; flex-shrink: 0;">${attr.name}</div>
            <div style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 12px; color: #1f2937; flex: 1; word-break: break-all;">${attr.value || 'null'}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Dependencies
  let depsSection = null;
  if (resource.depends_on && resource.depends_on.length > 0) {
    depsSection = document.createElement('div');
    depsSection.style.cssText = `
      margin-bottom: 20px;
    `;
    depsSection.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Dependencies (${resource.depends_on.length})</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${resource.depends_on.map(dep => `
          <span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;">${dep}</span>
        `).join('')}
      </div>
    `;
  }

  // References
  let refsSection = null;
  if (resource.references && resource.references.length > 0) {
    refsSection = document.createElement('div');
    refsSection.style.cssText = `
      margin-bottom: 20px;
    `;
    refsSection.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">References (${resource.references.length})</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${resource.references.map(ref => `
          <span style="background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;">${ref}</span>
        `).join('')}
      </div>
    `;
  }

  // Impact Chain
  const impactChain = calculateImpactChain(resource);
  let impactSection = null;
  if (impactChain.length > 0) {
    impactSection = document.createElement('div');
    impactSection.style.cssText = `
      margin-bottom: 20px;
    `;
    impactSection.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Impact Chain (${impactChain.length} resources affected)</div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        ${impactChain.map(item => `
          <div style="display: flex; align-items: center; padding: 6px 8px; background: #fef2f2; border-radius: 4px; border-left: 3px solid #ef4444;">
            <span style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 12px; color: #1f2937;">${item}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Actions
  const actionsSection = document.createElement('div');
  actionsSection.style.cssText = `
    display: flex;
    gap: 12px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  `;

  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = '📋 Copy Resource Name';
  copyBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  `;
  copyBtn.addEventListener('mouseenter', () => {
    copyBtn.style.background = '#2563eb';
  });
  copyBtn.addEventListener('mouseleave', () => {
    copyBtn.style.background = '#3b82f6';
  });
  copyBtn.addEventListener('click', () => {
    copyToClipboard(resource.type + '.' + resource.name);
  });

  const docsBtn = document.createElement('button');
  docsBtn.innerHTML = '📖 View Documentation';
  docsBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  `;
  docsBtn.addEventListener('mouseenter', () => {
    docsBtn.style.background = '#059669';
  });
  docsBtn.addEventListener('mouseleave', () => {
    docsBtn.style.background = '#10b981';
  });
  docsBtn.addEventListener('click', () => {
    openResourceDocs(resource.type);
  });

  actionsSection.appendChild(copyBtn);
  actionsSection.appendChild(docsBtn);

  // Append sections in the desired order: Name, Type, Attributes, Everything else
  content.appendChild(nameSection);
  content.appendChild(typeSection);
  
  // Append attributes if they exist
  if (attrsSection) {
    content.appendChild(attrsSection);
  }
  
  // Append dependencies if they exist
  if (depsSection) {
    content.appendChild(depsSection);
  }
  
  // Append references if they exist
  if (refsSection) {
    content.appendChild(refsSection);
  }
  
  // Append impact chain if it exists
  if (impactSection) {
    content.appendChild(impactSection);
  }
  
  // Append actions last
  content.appendChild(actionsSection);

  popup.appendChild(header);
  popup.appendChild(content);
  document.body.appendChild(popup);

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      style.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Close on backdrop click
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  `;
  backdrop.addEventListener('click', () => {
    popup.remove();
    backdrop.remove();
    style.remove();
    document.removeEventListener('keydown', handleEscape);
  });
  document.body.appendChild(backdrop);
}

// Enhanced module details popup
function showModuleDetails(module) {
  // Remove existing popup
  const existingPopup = document.getElementById('module-details-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = document.createElement('div');
  popup.id = 'module-details-popup';
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    z-index: 10000;
    max-width: 500px;
    width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: popupFadeIn 0.3s ease;
  `;

  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes popupFadeIn {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  `;
  document.head.appendChild(style);

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px 24px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
    border-radius: 12px 12px 0 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 18px;
    font-weight: bold;
  `;
  icon.textContent = 'M';

  const titleText = document.createElement('div');
  titleText.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  `;
  titleText.textContent = 'module.' + module.name;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.setAttribute('aria-label', 'Close details');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    font-size: 16px;
    transition: all 0.2s ease;
  `;
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#f3f4f6';
    closeBtn.style.color = '#374151';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'none';
    closeBtn.style.color = '#6b7280';
  });
  closeBtn.addEventListener('click', () => {
    popup.remove();
    style.remove();
  });

  title.appendChild(icon);
  title.appendChild(titleText);
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 24px;
  `;

  // Module name
  const nameSection = document.createElement('div');
  nameSection.style.cssText = `
    margin-bottom: 20px;
  `;
  nameSection.innerHTML = `
    <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Module Name</div>
    <div style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 14px; color: #1f2937; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${module.name}</div>
  `;

  // Module source
  const sourceSection = document.createElement('div');
  sourceSection.style.cssText = `
    margin-bottom: 20px;
  `;
  sourceSection.innerHTML = `
    <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Source</div>
    <div style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 14px; color: #1f2937; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${module.source || 'No source specified'}</div>
  `;

  // Line number
  const lineSection = document.createElement('div');
  lineSection.style.cssText = `
    margin-bottom: 20px;
  `;
  lineSection.innerHTML = `
    <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Line Number</div>
    <div style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 14px; color: #1f2937; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${module.line || 'Unknown'}</div>
  `;

  // Dependencies
  if (module.depends_on && module.depends_on.length > 0) {
    const depsSection = document.createElement('div');
    depsSection.style.cssText = `
      margin-bottom: 20px;
    `;
    depsSection.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Dependencies (${module.depends_on.length})</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${module.depends_on.map(dep => `
          <span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;">${dep}</span>
        `).join('')}
      </div>
    `;
    content.appendChild(depsSection);
  }

  // References
  if (module.references && module.references.length > 0) {
    const refsSection = document.createElement('div');
    refsSection.style.cssText = `
      margin-bottom: 20px;
    `;
    refsSection.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">References (${module.references.length})</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${module.references.map(ref => `
          <span style="background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;">${ref}</span>
        `).join('')}
      </div>
    `;
    content.appendChild(refsSection);
  }

  // Impact Chain
  const impactChain = calculateImpactChain(module);
  if (impactChain.length > 0) {
    const impactSection = document.createElement('div');
    impactSection.style.cssText = `
      margin-bottom: 20px;
    `;
    impactSection.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Impact Chain (${impactChain.length} resources affected)</div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        ${impactChain.map(item => `
          <div style="display: flex; align-items: center; padding: 6px 8px; background: #fef2f2; border-radius: 4px; border-left: 3px solid #ef4444;">
            <span style="font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace; font-size: 12px; color: #1f2937;">${item}</span>
          </div>
        `).join('')}
      </div>
    `;
    content.appendChild(impactSection);
  }

  // Actions
  const actionsSection = document.createElement('div');
  actionsSection.style.cssText = `
    display: flex;
    gap: 12px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  `;

  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = '📋 Copy Module Name';
  copyBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: #f97316;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  `;
  copyBtn.addEventListener('mouseenter', () => {
    copyBtn.style.background = '#ea580c';
  });
  copyBtn.addEventListener('mouseleave', () => {
    copyBtn.style.background = '#f97316';
  });
  copyBtn.addEventListener('click', () => {
    copyToClipboard('module.' + module.name);
  });

  const sourceBtn = document.createElement('button');
  sourceBtn.innerHTML = '🔗 Copy Source';
  sourceBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  `;
  sourceBtn.addEventListener('mouseenter', () => {
    sourceBtn.style.background = '#2563eb';
  });
  sourceBtn.addEventListener('mouseleave', () => {
    sourceBtn.style.background = '#3b82f6';
  });
  sourceBtn.addEventListener('click', () => {
    copyToClipboard(module.source || 'No source specified');
  });

  actionsSection.appendChild(copyBtn);
  actionsSection.appendChild(sourceBtn);

  content.appendChild(nameSection);
  content.appendChild(sourceSection);
  content.appendChild(lineSection);
  content.appendChild(actionsSection);

  popup.appendChild(header);
  popup.appendChild(content);
  document.body.appendChild(popup);

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      style.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Close on backdrop click
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  `;
  backdrop.addEventListener('click', () => {
    popup.remove();
    backdrop.remove();
    style.remove();
    document.removeEventListener('keydown', handleEscape);
  });
  document.body.appendChild(backdrop);
}

function createCleanProviderSection(provider, resources) {
  const section = document.createElement('div');
  section.className = 'provider-section';
  section.style.cssText = `
    margin-bottom: 24px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  `;

  // Provider header
  const header = document.createElement('div');
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', 'true');
  header.setAttribute('aria-label', 'Toggle ' + provider.toUpperCase() + ' provider section');
  header.style.cssText = `
    padding: 16px 20px;
    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
    border-bottom: 1px solid #d1d5db;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    outline: none;
  `;

  header.addEventListener('mouseenter', () => {
    header.style.background = 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)';
  });

  header.addEventListener('mouseleave', () => {
    header.style.background = 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
  });

  // Focus states for accessibility
  header.addEventListener('focus', () => {
    header.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
  });

  header.addEventListener('blur', () => {
    header.style.boxShadow = 'none';
  });

  // Keyboard navigation
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      header.click();
    }
  });

  // Provider icon
  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 14px;
    flex-shrink: 0;
  `;
  icon.textContent = provider.toUpperCase().charAt(0);

  // Provider info
  const info = document.createElement('div');
  info.style.cssText = `
    flex: 1;
  `;

  const name = document.createElement('div');
  name.style.cssText = `
    font-weight: 600;
    color: #1f2937;
    font-size: 16px;
    margin-bottom: 2px;
  `;
  name.textContent = provider.toUpperCase() + ' Provider';

  const count = document.createElement('div');
  count.style.cssText = `
    color: #6b7280;
    font-size: 12px;
  `;
  count.textContent = resources.length + ' resources';

  info.appendChild(name);
  info.appendChild(count);

  // Expand/collapse icon
  const expandIcon = document.createElement('div');
  expandIcon.className = 'expand-icon';
  expandIcon.style.cssText = `
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    font-size: 12px;
    transition: transform 0.2s ease;
  `;
  expandIcon.textContent = '▼';

  header.appendChild(icon);
  header.appendChild(info);
  header.appendChild(expandIcon);

  // Resources list
  const resourcesList = document.createElement('div');
  resourcesList.className = 'resources-list';
  resourcesList.style.cssText = `
    display: block;
    padding: 8px 0;
  `;

  resources.forEach((resource, index) => {
    const resourceItem = createCleanResourceItem(resource, index === resources.length - 1);
    resourcesList.appendChild(resourceItem);
  });

  section.appendChild(header);
  section.appendChild(resourcesList);

  // Toggle functionality
  header.addEventListener('click', () => {
    const isExpanded = resourcesList.style.display === 'block';
    resourcesList.style.display = isExpanded ? 'none' : 'block';
    expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
  });

  return section;
}

function createCleanResourceItem(resource, isLast) {
  const item = document.createElement('div');
  item.className = 'resource-item';
  item.setAttribute('role', 'button');
  item.setAttribute('tabindex', '0');
  item.setAttribute('aria-label', 'Resource ' + resource.type + '.' + resource.name);
  item.style.cssText = `
    padding: 12px 20px;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 12px;
    outline: none;
  `;

  item.addEventListener('mouseenter', () => {
    item.style.background = '#f9fafb';
  });

  item.addEventListener('mouseleave', () => {
    item.style.background = 'transparent';
  });

  item.addEventListener('click', () => {
    showResourceDetails(resource);
  });

  // Focus states for accessibility
  item.addEventListener('focus', () => {
    item.style.background = '#f0f9ff';
    item.style.boxShadow = 'inset 3px 0 0 #3b82f6';
  });

  item.addEventListener('blur', () => {
    item.style.background = 'transparent';
    item.style.boxShadow = 'none';
  });

  // Keyboard navigation
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showResourceDetails(resource);
    }
  });

  // Right-click context menu
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showResourceContextMenu(e, resource);
  });

  // Resource icon
  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 24px;
    height: 24px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 12px;
    font-weight: bold;
    flex-shrink: 0;
  `;
  icon.textContent = 'R';

  // Resource info
  const info = document.createElement('div');
  info.style.cssText = `
    flex: 1;
  `;

  const name = document.createElement('div');
  name.style.cssText = `
    font-weight: 500;
    color: #1f2937;
    font-size: 14px;
    margin-bottom: 2px;
  `;
  name.textContent = resource.type + '.' + resource.name;

  const type = document.createElement('div');
  type.style.cssText = `
    color: #6b7280;
    font-size: 12px;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
  `;
  type.textContent = resource.type;

  info.appendChild(name);
  info.appendChild(type);

  // Dependencies indicator
  const depsIndicator = document.createElement('div');
  depsIndicator.style.cssText = `
    display: flex;
    gap: 4px;
    align-items: center;
  `;

  if (resource.depends_on && resource.depends_on.length > 0) {
    const depsBadge = document.createElement('span');
    depsBadge.style.cssText = `
      background: #fef3c7;
      color: #92400e;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    `;
    depsBadge.textContent = resource.depends_on.length + ' deps';
    depsIndicator.appendChild(depsBadge);
  }

  if (resource.references && resource.references.length > 0) {
    const refsBadge = document.createElement('span');
    refsBadge.style.cssText = `
      background: #e0e7ff;
      color: #3730a3;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    `;
    refsBadge.textContent = resource.references.length + ' refs';
    depsIndicator.appendChild(refsBadge);
  }

  item.appendChild(icon);
  item.appendChild(info);
  item.appendChild(depsIndicator);

  return item;
}

function createCleanModulesSection(modules) {
  const section = document.createElement('div');
  section.className = 'modules-section';
  section.style.cssText = `
    margin-bottom: 24px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  `;

  // Modules header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px 20px;
    background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
    border-bottom: 1px solid #d1d5db;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: background-color 0.2s ease;
  `;

  header.addEventListener('mouseenter', () => {
    header.style.background = 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)';
  });

  header.addEventListener('mouseleave', () => {
    header.style.background = 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)';
  });

  // Module icon
  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 14px;
    flex-shrink: 0;
  `;
  icon.textContent = 'M';

  // Module info
  const info = document.createElement('div');
  info.style.cssText = `
    flex: 1;
  `;

  const name = document.createElement('div');
  name.style.cssText = `
    font-weight: 600;
    color: #1f2937;
    font-size: 16px;
    margin-bottom: 2px;
  `;
  name.textContent = 'Modules';

  const count = document.createElement('div');
  count.style.cssText = `
    color: #6b7280;
    font-size: 12px;
  `;
  count.textContent = modules.length + ' modules';

  info.appendChild(name);
  info.appendChild(count);

  // Expand/collapse icon
  const expandIcon = document.createElement('div');
  expandIcon.className = 'expand-icon';
  expandIcon.style.cssText = `
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    font-size: 12px;
    transition: transform 0.2s ease;
  `;
  expandIcon.textContent = '▼';

  header.appendChild(icon);
  header.appendChild(info);
  header.appendChild(expandIcon);

  // Modules list
  const modulesList = document.createElement('div');
  modulesList.className = 'modules-list';
  modulesList.style.cssText = `
    display: block;
    padding: 8px 0;
  `;

  modules.forEach((module, index) => {
    const moduleItem = createCleanModuleItem(module, index === modules.length - 1);
    modulesList.appendChild(moduleItem);
  });

  section.appendChild(header);
  section.appendChild(modulesList);

  // Toggle functionality
  header.addEventListener('click', () => {
    const isExpanded = modulesList.style.display === 'block';
    modulesList.style.display = isExpanded ? 'none' : 'block';
    expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
  });

  return section;
}

function createCleanModuleItem(module, isLast) {
  const item = document.createElement('div');
  item.className = 'module-item';
  item.style.cssText = `
    padding: 12px 20px;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  item.addEventListener('mouseenter', () => {
    item.style.background = '#fff7ed';
  });

  item.addEventListener('mouseleave', () => {
    item.style.background = 'transparent';
  });

  item.addEventListener('click', () => {
    showModuleDetails(module);
  });

  // Module icon
  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 24px;
    height: 24px;
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 12px;
    font-weight: bold;
    flex-shrink: 0;
  `;
  icon.textContent = 'M';

  // Module info
  const info = document.createElement('div');
  info.style.cssText = `
    flex: 1;
  `;

  const name = document.createElement('div');
  name.style.cssText = `
    font-weight: 500;
    color: #1f2937;
    font-size: 14px;
    margin-bottom: 2px;
  `;
  name.textContent = 'module.' + module.name;

  const source = document.createElement('div');
  source.style.cssText = `
    color: #6b7280;
    font-size: 12px;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
  `;
  source.textContent = module.source || 'No source specified';

  info.appendChild(name);
  info.appendChild(source);

  item.appendChild(icon);
  item.appendChild(info);

  return item;
}

function createResourceNode(resource, isLast) {
  const node = createTreeNode('🔧 ' + resource.type + '.' + resource.name, false);
  
  // Add dependency indicators
  const indicators = [];
  if (resource.depends_on && resource.depends_on.length > 0) {
    indicators.push('deps:' + resource.depends_on.length);
  }
  if (resource.references && resource.references.length > 0) {
    indicators.push('refs:' + resource.references.length);
  }
  
  if (indicators.length > 0) {
    const indicatorSpan = document.createElement('span');
    indicatorSpan.textContent = ' [' + indicators.join(', ') + ']';
    indicatorSpan.style.cssText = `
      color: #6b7280;
      font-size: 11px;
      margin-left: 4px;
    `;
    node.querySelector('span:last-child').appendChild(indicatorSpan);
  }

  // Add click handler to show details
  node.addEventListener('click', (e) => {
    if (e.target !== node.querySelector('.expand-btn')) {
      showResourceDetails(resource);
    }
  });

  return node;
}

function createModulesNode(modules, isLast) {
  const node = createTreeNode('📁 Modules', true);
  
  // Add module count
  const countSpan = document.createElement('span');
  countSpan.textContent = ' (' + modules.length + ')';
  countSpan.style.cssText = `
    color: #6b7280;
    font-size: 11px;
    margin-left: 4px;
  `;
  node.querySelector('span:last-child').appendChild(countSpan);

  // Add modules as children
  modules.forEach((module, index) => {
    const isLastModule = index === modules.length - 1;
    const moduleNode = createModuleNode(module, isLastModule);
    node.querySelector('.tree-children').appendChild(moduleNode);
  });

  return node;
}

function createModuleNode(module, isLast) {
  const node = createTreeNode('📦 module.' + module.name, false);
  
  // Add source info
  if (module.source) {
    const sourceSpan = document.createElement('span');
    sourceSpan.textContent = ' (' + module.source + ')';
    sourceSpan.style.cssText = `
      color: #6b7280;
      font-size: 11px;
      margin-left: 4px;
    `;
    node.querySelector('span:last-child').appendChild(sourceSpan);
  }

  // Add click handler to show details
  node.addEventListener('click', (e) => {
    if (e.target !== node.querySelector('.expand-btn')) {
      showModuleDetails(module);
    }
  });

  return node;
}

function toggleNode(node) {
  const children = node.querySelector('.tree-children');
  const expandBtn = node.querySelector('.expand-btn');
  
  if (children.style.display === 'none') {
    children.style.display = 'block';
    expandBtn.textContent = '▼';
  } else {
    children.style.display = 'none';
    expandBtn.textContent = '▶';
  }
}


function filterCleanTree(query, container) {
  const sections = container.querySelectorAll('.provider-section, .modules-section');
  
  if (!query) {
    // Show all sections and reset their state
    sections.forEach(section => {
      section.style.display = 'block';
      const list = section.querySelector('.resources-list, .modules-list');
      if (list) {
        list.style.display = 'block';
        const expandIcon = section.querySelector('.expand-icon');
        if (expandIcon) expandIcon.style.transform = 'rotate(0deg)';
      }
      // Remove highlighting
      const items = section.querySelectorAll('.resource-item, .module-item');
      items.forEach(item => {
        item.style.background = 'transparent';
        const nameEl = item.querySelector('div:first-child');
        const typeEl = item.querySelector('div:last-child');
        if (nameEl) nameEl.innerHTML = nameEl.textContent;
        if (typeEl) typeEl.innerHTML = typeEl.textContent;
      });
    });
    return;
  }
  
  const searchQuery = query.toLowerCase();
  
  sections.forEach(section => {
    const items = section.querySelectorAll('.resource-item, .module-item');
    let hasMatches = false;
    
    items.forEach(item => {
      const nameEl = item.querySelector('div:first-child');
      const typeEl = item.querySelector('div:last-child');
      const name = nameEl ? nameEl.textContent.toLowerCase() : '';
      const type = typeEl ? typeEl.textContent.toLowerCase() : '';
      const matches = name.includes(searchQuery) || type.includes(searchQuery);
      
      if (matches) {
        item.style.display = 'flex';
        item.style.background = '#fef3c7'; // Highlight matching items
        hasMatches = true;
        
        // Highlight search terms
        if (nameEl) {
          nameEl.innerHTML = highlightText(nameEl.textContent, searchQuery);
        }
        if (typeEl) {
          typeEl.innerHTML = highlightText(typeEl.textContent, searchQuery);
        }
      } else {
        item.style.display = 'none';
        item.style.background = 'transparent';
        // Reset highlighting
        if (nameEl) nameEl.innerHTML = nameEl.textContent;
        if (typeEl) typeEl.innerHTML = typeEl.textContent;
      }
    });
    
    if (hasMatches) {
      section.style.display = 'block';
      const list = section.querySelector('.resources-list, .modules-list');
      if (list) {
        list.style.display = 'block';
        const expandIcon = section.querySelector('.expand-icon');
        if (expandIcon) expandIcon.style.transform = 'rotate(0deg)';
      }
    } else {
      section.style.display = 'none';
    }
  });
}

// Helper function to highlight search terms
function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark style="background: #fbbf24; padding: 1px 2px; border-radius: 2px;">$1</mark>');
}


function initGraph(elements) {
  // Graph functionality removed - using clean tree view instead
  return;
}

// --------- UI wiring ----------
function setupToggleButton() {
  const btn = document.getElementById('tf-toggle-btn');
  if (!btn) return console.error('setupToggleButton: Toggle button not found');
  if (btn.dataset.bound) return;
  btn.dataset.bound = '1';
  console.log('setupToggleButton: Toggle button found, binding click event');
  
  // Add hide functionality with right-click
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    btn.classList.toggle('hidden');
    console.log('Toggle button hidden:', btn.classList.contains('hidden'));
  });
  
  // Add drag functionality
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  btn.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click only
      isDragging = true;
      btn.classList.add('dragging');
      
      const rect = btn.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      
      e.preventDefault();
    }
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Keep button within viewport bounds
      const maxX = window.innerWidth - btn.offsetWidth;
      const maxY = window.innerHeight - btn.offsetHeight;
      
      btn.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
      btn.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
      btn.style.right = 'auto'; // Override the fixed right positioning
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      btn.classList.remove('dragging');
    }
  });
  
  btn.onclick = (e) => {
    // Only trigger click if not dragging
    if (!isDragging) {
      const sidebar = document.getElementById('tf-explorer-sidebar');
      if (!sidebar) return console.error('Toggle: Sidebar not found');
      const next = sidebar.style.display === 'none' ? 'block' : 'none';
      sidebar.style.display = next;
      
      // Move the toggle button when sidebar is open (only if not manually positioned)
      if (next === 'block' && btn.style.left === '') {
        btn.classList.add('sidebar-open');
      } else if (next === 'none') {
        btn.classList.remove('sidebar-open');
      }
      
      // If opening the sidebar, ensure the graph is initialized
      if (next === 'block') {
        // Trigger a small delay to let the container render, then reinitialize graph
        setTimeout(() => {
          const content = collectCodeText();
          if (content) {
            const { resources, modules } = parseHCL(content);
            const { elements } = buildDependencyGraph(resources, modules);
            initGraph(elements);
            
            // Ensure legend is closed when sidebar is first opened
            setTimeout(() => {
              const legendContent = document.getElementById('legend-content');
              const legendToggle = document.getElementById('legend-toggle');
              if (legendContent && legendToggle) {
                legendContent.style.display = 'none';
                legendToggle.textContent = '▶';
              }
            }, 150);
          }
        }, 100);
      }
      
      console.log('Toggle: Sidebar display set to', next);
    }
  };
}
// --- ensure sidebar DOM exists (ids used by renderLists / graph) ---
function ensureSidebar() {
  if (document.getElementById('tf-explorer-sidebar')) return;

  const root = document.createElement('div');
  root.id = 'tf-explorer-root';
  root.innerHTML = `
    <style>
      #tf-explorer-sidebar{position:fixed;top:10px;right:10px;width:550px;max-height:85vh;overflow:auto;background:#111;color:#eee;border:1px solid #333;border-radius:10px;z-index:2147483647;font:13px/1.4 system-ui,Segoe UI,Roboto,Arial;padding:10px}
      #tf-explorer-sidebar h3{margin:6px 0 4px;font-size:14px}
      #tf-explorer-sidebar ul{margin:0 0 8px 16px;padding:0}
      #tf-explorer-sidebar li{margin:2px 0;list-style:disc}
      #tf-explorer-sidebar a{color:#8ab4ff;text-decoration:none}
      #tf-explorer-sidebar .tf-error{color:#ff6b6b}
      #tf-toggle-btn{position:fixed;top:10px;right:380px;padding:6px 10px;border-radius:8px;border:1px solid #333;background:#1b1b1b;color:#eee;z-index:2147483647;cursor:pointer}
      #tf-resources-section{margin-bottom:10px}
      #tf-modules-section{margin-bottom:10px}
      #tf-graph{height:400px;background:#fafafa;border:2px solid #ddd;border-radius:8px;margin-top:6px;position:relative;overflow:hidden}
    </style>
    <button id="tf-toggle-btn">TF Explorer</button>
    <aside id="tf-explorer-sidebar">
      <div id="tf-resources-section"></div>
      <div id="tf-modules-section"></div>
      <div id="tf-graph"></div>
    </aside>
  `;
  document.documentElement.appendChild(root);
}



function renderLists(resources, modules) {
  // Resources with collapsible section
  const resSection = document.getElementById('tf-resources-section');
  if (resSection) {
    resSection.innerHTML = '';
    
    // Create header with toggle
    const header = document.createElement('div');
    header.className = 'tf-section-header';
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      padding: 8px 0;
      border-bottom: 1px solid #333;
      margin-bottom: 8px;
    `;
    
    const title = document.createElement('h4');
    title.textContent = 'Resources (' + resources.length + ')';
    title.style.cssText = 'margin: 0; font-size: 18px; color: #007bff;';
    
    const toggle = document.createElement('span');
    toggle.innerHTML = '▼';
    toggle.style.cssText = `
      font-size: 12px;
      color: #007bff;
      transition: transform 0.2s ease;
    `;
    
    header.appendChild(title);
    header.appendChild(toggle);
    
    // Create collapsible content
    const content = document.createElement('div');
    content.className = 'tf-section-content';
    content.style.cssText = `
      max-height: 200px;
      overflow-y: auto;
      transition: max-height 0.3s ease;
    `;
    
    const resList = document.createElement('ul');
    resList.id = 'tf-resources';
    resList.style.cssText = 'list-style: none; padding: 0; margin: 0;';
    
    resources.forEach(r => {
      const li = document.createElement('li');
      li.style.cssText = 'margin: 8px 0; font-size: 16px;';
      const a = document.createElement('a');
      a.href = getProviderDocUrl(r.type);
      a.textContent = r.type + '.' + r.name;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.cssText = 'color: #007bff; text-decoration: none; font-weight: 500; cursor: pointer;';
      a.onmouseover = () => a.style.textDecoration = 'underline';
      a.onmouseout = () => a.style.textDecoration = 'none';
      li.appendChild(a);
      resList.appendChild(li);
    });
    
    content.appendChild(resList);
    
    // Toggle functionality
    let isExpanded = true;
    header.onclick = () => {
      isExpanded = !isExpanded;
      content.style.maxHeight = isExpanded ? '200px' : '0px';
      toggle.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
      toggle.innerHTML = isExpanded ? '▼' : '▶';
    };
    
    resSection.appendChild(header);
    resSection.appendChild(content);
  }

  // Modules with collapsible section
  const modSection = document.getElementById('tf-modules-section');
  if (modSection) {
    modSection.innerHTML = '';
    
    // Create header with toggle
    const header = document.createElement('div');
    header.className = 'tf-section-header';
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      padding: 8px 0;
      border-bottom: 1px solid #333;
      margin-bottom: 8px;
    `;
    
    const title = document.createElement('h4');
    title.textContent = 'Modules (' + modules.length + ')';
    title.style.cssText = 'margin: 0; font-size: 18px; color: #007bff;';
    
    const toggle = document.createElement('span');
    toggle.innerHTML = '▼';
    toggle.style.cssText = `
      font-size: 12px;
      color: #007bff;
      transition: transform 0.2s ease;
    `;
    
    header.appendChild(title);
    header.appendChild(toggle);
    
    // Create collapsible content
    const content = document.createElement('div');
    content.className = 'tf-section-content';
    content.style.cssText = `
      max-height: 200px;
      overflow-y: auto;
      transition: max-height 0.3s ease;
    `;
    
    const modList = document.createElement('ul');
    modList.id = 'tf-modules';
    modList.style.cssText = 'list-style: none; padding: 0; margin: 0;';
    
    modules.forEach(m => {
      const li = document.createElement('li');
      li.style.cssText = 'margin: 8px 0; font-size: 16px;';
      const a = document.createElement('a');
      let href = 'https://github.com/';
      if (/^git::/.test(m.source)) href = m.source.replace(/^git::/, '');
      else if (/^https?:\/\//.test(m.source)) href = m.source;
      else if (m.source) href = 'https://github.com/' + m.source;
      a.href = href;
      a.textContent = 'module.' + m.name;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.cssText = 'color: #007bff; text-decoration: none; font-weight: 500; cursor: pointer;';
      a.onmouseover = () => a.style.textDecoration = 'underline';
      a.onmouseout = () => a.style.textDecoration = 'none';
      li.appendChild(a);
      modList.appendChild(li);
    });
    
    content.appendChild(modList);
    
    // Toggle functionality
    let isExpanded = true;
    header.onclick = () => {
      isExpanded = !isExpanded;
      content.style.maxHeight = isExpanded ? '200px' : '0px';
      toggle.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
      toggle.innerHTML = isExpanded ? '▼' : '▶';
    };
    
    modSection.appendChild(header);
    modSection.appendChild(content);
  }


}



// --------- Main ----------
function processTerraformFile() {
  console.log('processTerraformFile: Starting');
  if (!isTerraformPath()) return;

  // make sure our UI exists first
  ensureSidebar();

  if (!sidebarEl) sidebarEl = document.getElementById('tf-explorer-sidebar');
  const graphEl = document.getElementById('tf-graph');
  if (!graphEl) { console.warn('processTerraformFile: #tf-graph missing'); return; }

  const content = collectCodeText();
  console.log('processTerraformFile: Content length:', content.length);
  if (!content) return;

  // Check if content has actually changed (but allow initial load)
  const contentHash = btoa(content).slice(0, 20); // Simple hash
  if (lastContentHash === contentHash && lastContentHash !== null) {
    console.log('processTerraformFile: Content unchanged, skipping update');
    return;
  }
  lastContentHash = contentHash;

  const { resources, modules } = parseHCL(content);

  // safe call (avoids ReferenceError if something gets reordered)
  if (typeof renderLists === 'function') {
    renderLists(resources, modules);
  } else {
    console.warn('renderLists missing – skipping list rendering');
  }

  // Removed auto-open behavior - sidebar will stay closed until user clicks the toggle button

  const { elements, dependencyMap, impactMap } = buildDependencyGraph(resources, modules);
  
  // Store dependency data globally for use in impact analysis
  window.tfDependencyData = { dependencyMap, impactMap, elements };
  
  // Initialize the clean tree view
  initCleanTreeView(resources, modules);
  
  // Clean tree view is now the only view
}

function debouncedRun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    setupToggleButton();
    processTerraformFile();
  }, 800); // Increased debounce time
}

const observer = new MutationObserver((mutations) => {
  // Ignore mutations caused inside our own UI
  for (const m of mutations) {
    if (m.target && m.target.closest && m.target.closest('#tf-explorer-root')) {
      return;
    }
  }
  
  // Trigger on any significant DOM changes (less restrictive)
  let shouldUpdate = false;
  for (const m of mutations) {
    const target = m.target;
    // Check for code content or general page structure changes
    if (target && target.closest && (
      target.closest('pre') ||
      target.closest('code') ||
      target.closest('.blob-code') ||
      target.closest('[data-testid="code-content"]') ||
      target.closest('.file-content') ||
      target.closest('main') ||
      target.closest('.container') ||
      target.closest('#content') ||
      target.closest('.content') ||
      (m.type === 'childList' && m.addedNodes.length > 0)
    )) {
      shouldUpdate = true;
      break;
    }
  }
  
  if (shouldUpdate) {
    console.log('script.js: DOM mutation detected');
    debouncedRun();
  }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });



// Test localStorage on startup
console.log('Testing localStorage...');
try {
  localStorage.setItem('test', 'test');
  localStorage.removeItem('test');
  console.log('localStorage test: PASSED');
} catch (error) {
  console.log('localStorage test: FAILED', error);
}

// Initial run to ensure popup opens on page load
setTimeout(() => {
  console.log('script.js: Initial run');
  setupToggleButton();
  processTerraformFile();
}, 1000);

// Simple auto-save system
const STORAGE_KEY = 'tf_graph_state';

// Simple save function
function saveGraph() {
  if (!cy) {
    console.log('No cytoscape instance available');
    return;
  }
  
  try {
    const data = {
      url: window.location.href,
      timestamp: Date.now(),
      elements: cy.json().elements,
      viewport: {
        pan: cy.pan(),
        zoom: cy.zoom()
      }
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('✅ Graph saved successfully (with positions)');
    
    // Show status indicator
    const statusDiv = document.getElementById('canvas-status');
    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.opacity = '1';
      statusDiv.textContent = 'Auto-saved';
      setTimeout(() => {
        statusDiv.style.opacity = '0';
        setTimeout(() => {
          statusDiv.style.display = 'none';
        }, 300);
      }, 1500);
    }
  } catch (error) {
    console.error('Failed to save graph:', error);
  }
}

// Simple load function
function loadGraph() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      console.log('No saved graph found');
      return;
    }
    
    const data = JSON.parse(saved);
    if (data.url !== window.location.href) {
      console.log('Saved graph is for different URL');
      return;
    }
    
    if (cy && data.elements) {
      cy.elements().remove();
      cy.add(data.elements);
      
      // Restore viewport if available
      if (data.viewport) {
        cy.pan(data.viewport.pan);
        cy.zoom(data.viewport.zoom);
        console.log('✅ Graph loaded successfully (with positions)');
      } else {
        console.log('✅ Graph loaded successfully (no viewport data)');
      }
    }
  } catch (error) {
    console.error('Failed to load graph:', error);
  }
}

// Simple clear function
function clearGraph() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('Graph state cleared');
  } catch (error) {
    console.error('Failed to clear graph:', error);
  }
}

// --------- Hierarchical Tree Layout ----------
function createHierarchicalLayout(elements) {
  const nodes = elements.filter(el => el.data.id && !el.data.source);
  const edges = elements.filter(el => el.data.source && el.data.target);
  
  // Build adjacency lists
  const inEdges = new Map(); // incoming edges (dependencies)
  const outEdges = new Map(); // outgoing edges (dependents)
  
  nodes.forEach(node => {
    inEdges.set(node.data.id, []);
    outEdges.set(node.data.id, []);
  });
  
  edges.forEach(edge => {
    const source = edge.data.source;
    const target = edge.data.target;
    
    // Add to adjacency lists
    if (outEdges.has(source)) {
      outEdges.get(source).push(target);
    }
    if (inEdges.has(target)) {
      inEdges.get(target).push(source);
    }
  });
  
  // Find root nodes (nodes with no dependencies)
  const rootNodes = [];
  nodes.forEach(node => {
    if (inEdges.get(node.data.id).length === 0) {
      rootNodes.push(node.data.id);
    }
  });
  
  // Calculate levels using BFS
  const levels = new Map();
  const visited = new Set();
  const queue = [];
  
  // Start with root nodes at level 0
  rootNodes.forEach(root => {
    levels.set(root, 0);
    queue.push(root);
    visited.add(root);
  });
  
  // BFS to assign levels
  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = levels.get(current);
    
    // Process all dependents of current node
    outEdges.get(current).forEach(dependent => {
      if (!visited.has(dependent)) {
        // Check if all dependencies of this dependent are processed
        const allDepsProcessed = inEdges.get(dependent).every(dep => visited.has(dep));
        if (allDepsProcessed) {
          levels.set(dependent, currentLevel + 1);
          queue.push(dependent);
          visited.add(dependent);
        }
      }
    });
  }
  
  // Handle any remaining nodes (cycles or isolated nodes)
  nodes.forEach(node => {
    if (!levels.has(node.data.id)) {
      levels.set(node.data.id, 0); // Default to root level
    }
  });
  
  // Group nodes by level
  const levelGroups = new Map();
  nodes.forEach(node => {
    const level = levels.get(node.data.id);
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level).push(node.data.id);
  });
  
  // Create layout positions
  const layout = {
    name: 'hierarchical-tree',
    nodeDimensionsIncludeLabels: true,
    fit: true,
    padding: 50,
    animate: true,
    animationDuration: 1000,
    animationEasing: 'ease-out',
    
    // Custom positioning function
    ready: function() {
      const maxLevel = Math.max(...levelGroups.keys());
      const levelHeight = 150;
      const nodeSpacing = 120;
      
      levelGroups.forEach((nodeIds, level) => {
        const y = level * levelHeight + 50;
        const totalWidth = nodeIds.length * nodeSpacing;
        const startX = (this.width() - totalWidth) / 2;
        
        nodeIds.forEach((nodeId, index) => {
          const node = this.getElementById(nodeId);
          if (node.length > 0) {
            const x = startX + index * nodeSpacing;
            node.position({
              x: x,
              y: y
            });
          }
        });
      });
    }
  };
  
  return layout;
}

// Apply hierarchical layout to the graph
function applyHierarchicalLayout(cy) {
  if (!cy) return;
  
  const nodes = cy.nodes();
  const edges = cy.edges();
  
  // Build dependency graph
  const inEdges = new Map(); // incoming edges (dependencies)
  const outEdges = new Map(); // outgoing edges (dependents)
  
  nodes.forEach(node => {
    inEdges.set(node.id(), []);
    outEdges.set(node.id(), []);
  });
  
  edges.forEach(edge => {
    const source = edge.source().id();
    const target = edge.target().id();
    
    if (outEdges.has(source)) {
      outEdges.get(source).push(target);
    }
    if (inEdges.has(target)) {
      inEdges.get(target).push(source);
    }
  });
  
  // Find root nodes (nodes with no dependencies)
  const rootNodes = [];
  nodes.forEach(node => {
    if (inEdges.get(node.id()).length === 0) {
      rootNodes.push(node.id());
    }
  });
  
  // Calculate levels using BFS
  const levels = new Map();
  const visited = new Set();
  const queue = [];
  
  // Start with root nodes at level 0
  rootNodes.forEach(root => {
    levels.set(root, 0);
    queue.push(root);
    visited.add(root);
  });
  
  // BFS to assign levels
  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = levels.get(current);
    
    // Process all dependents of current node
    outEdges.get(current).forEach(dependent => {
      if (!visited.has(dependent)) {
        // Check if all dependencies of this dependent are processed
        const allDepsProcessed = inEdges.get(dependent).every(dep => visited.has(dep));
        if (allDepsProcessed) {
          levels.set(dependent, currentLevel + 1);
          queue.push(dependent);
          visited.add(dependent);
        }
      }
    });
  }
  
  // Handle any remaining nodes (cycles or isolated nodes)
  nodes.forEach(node => {
    if (!levels.has(node.id())) {
      levels.set(node.id(), 0);
    }
  });
  
  // Group nodes by level
  const levelGroups = new Map();
  nodes.forEach(node => {
    const level = levels.get(node.id());
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level).push(node.id());
  });
  
  // Position nodes
  const levelHeight = 120;
  const nodeSpacing = 100;
  
  levelGroups.forEach((nodeIds, level) => {
    const y = level * levelHeight + 50;
    const totalWidth = nodeIds.length * nodeSpacing;
    const startX = (cy.width() - totalWidth) / 2;
    
    nodeIds.forEach((nodeId, index) => {
      const node = cy.getElementById(nodeId);
      if (node.length > 0) {
        const x = startX + index * nodeSpacing;
        node.position({
          x: x,
          y: y
        });
      }
    });
  });
  
  // Fit the graph
  cy.fit();
}

  // Add layout controls
  function addLayoutControls(container) {
    const layoutDiv = document.createElement('div');
    layoutDiv.setAttribute('data-layout-controls', 'true');
    layoutDiv.style.cssText = `
      position: absolute;
      bottom: 10px;
      right: 10px;
      display: flex;
      flex-direction: row;
      gap: 8px;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.95);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #ddd;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
  
  // Hierarchical Tree Layout button
  const treeBtn = document.createElement('button');
  treeBtn.innerHTML = 'Tree';
  treeBtn.title = 'Hierarchical Tree Layout';
  treeBtn.style.cssText = `
    width: 50px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    white-space: nowrap;
    overflow: hidden;
    transition: all 0.2s ease;
  `;
  treeBtn.onclick = () => {
    applyHierarchicalLayout(cy);
  };
  
  // Force Layout button (original cose layout)
  const forceBtn = document.createElement('button');
  forceBtn.innerHTML = 'Force';
  forceBtn.title = 'Force-Directed Layout';
  forceBtn.style.cssText = `
    width: 55px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    white-space: nowrap;
    overflow: hidden;
    transition: all 0.2s ease;
  `;
  forceBtn.onclick = () => {
    cy.layout({
      name: 'cose',
      idealEdgeLength: 120,
      nodeOverlap: 30,
      refresh: 20,
      fit: true,
      padding: 30,
      randomize: false,
      componentSpacing: 100,
      nodeRepulsion: 400000,
      gravity: 80,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0
    }).run();
  };
  
  // Grid Layout button
  const gridBtn = document.createElement('button');
  gridBtn.innerHTML = 'Grid';
  gridBtn.title = 'Grid Layout';
  gridBtn.style.cssText = `
    width: 45px;
    height: 32px;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    color: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    white-space: nowrap;
    overflow: hidden;
    transition: all 0.2s ease;
  `;
  gridBtn.onclick = () => {
    cy.layout({
      name: 'grid',
      fit: true,
      padding: 30,
      animate: true,
      animationDuration: 1000
    }).run();
  };
  
  layoutDiv.appendChild(treeBtn);
  layoutDiv.appendChild(forceBtn);
  layoutDiv.appendChild(gridBtn);
  
  return layoutDiv;
}