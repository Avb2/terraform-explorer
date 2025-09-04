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
    return `https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/${resourceName}`;
  }

  // Handle Azure resources
  if (resourceType.startsWith('azurerm_')) {
    const resourceName = resourceType.replace('azurerm_', '');
    return `https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/${resourceName}`;
  }

  // Handle Google Cloud resources
  if (resourceType.startsWith('google_')) {
    const resourceName = resourceType.replace('google_', '');
    return `https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/${resourceName}`;
  }

  // Handle Kubernetes resources
  if (resourceType.startsWith('kubernetes_')) {
    const resourceName = resourceType.replace('kubernetes_', '');
    return `https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/${resourceName}`;
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
      return `https://registry.terraform.io/providers/hashicorp/${pattern.provider}/latest/docs/resources/${resourceName}`;
    }
  }

  // Fallback to general registry search
  return `https://registry.terraform.io/search?q=${encodeURIComponent(resourceType)}`;
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
    console.log(`Line mapping: sorted array index ${sortedIndex} -> line number ${item.lineNumber}, content: "${item.text.trim()}"`);
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
        console.log(`Found resource ${m[1]}.${m[2]} at array index ${index}, assigned line number ${actualLineNumber}`);
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
        console.log(`Found module ${m[1]} at array index ${index}, assigned line number ${actualLineNumber}`);
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
        issues.push(`Missing required attribute "${a}" for ${r.type}.${r.name} at line ${r.line}`);
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
    
    console.log(`Processing line ${lineNumber}: "${line}"`);
    
    if (line.startsWith('resource ')) {
      const m = line.match(/resource\s+"([^"]+)"\s+"([^"]+)"/);
      if (m) {
        console.log(`Found resource ${m[1]}.${m[2]} at line ${lineNumber}`);
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
        console.log(`Found module ${m[1]} at line ${lineNumber}`);
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
        issues.push(`Missing required attribute "${a}" for ${r.type}.${r.name} at line ${r.line}`);
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
function buildDependencyGraph(resources, modules) {
  const elements = [];
  const dependencyMap = new Map();
  const impactMap = new Map();
  
  // Create nodes
  resources.forEach(res => {
    const nodeId = `${res.type}.${res.name}`;
    elements.push({ 
      data: { 
        id: nodeId, 
        label: `${res.type}\n${res.name}`, 
        type: 'resource', 
        resourceType: res.type,
        depends_on: res.depends_on,
        references: res.references
      } 
    });
    dependencyMap.set(nodeId, res);
  });
  
  modules.forEach(mod => {
    const nodeId = `module.${mod.name}`;
    elements.push({ 
      data: { 
        id: nodeId, 
        label: `module\n${mod.name}`, 
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
    const sourceId = item.type ? `${item.type}.${item.name}` : `module.${item.name}`;
    
    // Add explicit dependencies (depends_on)
    (item.depends_on || []).forEach(dep => {
      if (dependencyMap.has(dep)) {
        elements.push({
          data: {
            id: `edge-${sourceId}-${dep}`,
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
            id: `edge-${sourceId}-${ref}`,
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

function createGraphControls(container) {
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

  // Create legend at bottom
  const legendDiv = document.createElement('div');
  legendDiv.setAttribute('data-graph-legend', 'true');
  legendDiv.style.cssText = `
    position: absolute;
    bottom: 60px;
    left: 10px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 12px;
    font-size: 11px;
    z-index: 1000;
    min-width: 140px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
  `;
  
  // Create collapsible legend content
  const legendContent = document.createElement('div');
  legendContent.id = 'legend-content';
  legendContent.innerHTML = `
    <div style="display: flex; align-items: center; margin: 2px 0;">
      <div style="width: 12px; height: 12px; background: #4CAF50; border: 1px solid #2E7D32; margin-right: 6px;"></div>
      Resources
    </div>
    <div style="display: flex; align-items: center; margin: 2px 0;">
      <div style="width: 12px; height: 12px; background: #FF9800; border: 1px solid #E65100; transform: rotate(45deg); margin-right: 6px;"></div>
      Modules
    </div>
    <div style="margin-top: 8px; border-top: 1px solid #ddd; padding-top: 4px;">
      <div style="font-size: 10px; margin-bottom: 2px;"><strong>Dependencies:</strong></div>
      <div style="display: flex; align-items: center; margin: 1px 0;">
        <div style="width: 16px; height: 3px; background: #FF5722; margin-right: 6px;"></div>
        <span style="font-size: 10px;">Explicit (depends_on)</span>
      </div>
      <div style="display: flex; align-items: center; margin: 1px 0;">
        <div style="width: 16px; height: 2px; background: #9C27B0; border-top: 1px dashed #9C27B0; margin-right: 6px;"></div>
        <span style="font-size: 10px;">Implicit (references)</span>
      </div>
      <div style="display: flex; align-items: center; margin: 1px 0;">
        <div style="width: 16px; height: 2px; background: #9C27B0; margin-right: 6px;"></div>
        <span style="font-size: 10px;">User Drawn</span>
      </div>
    </div>
    <div id="draw-status" style="margin-top: 8px; border-top: 1px solid #ddd; padding-top: 4px; font-size: 10px; color: #666;">
      <span id="draw-status-text">Draw mode: Inactive</span>
    </div>
    <div style="margin-top: 8px; border-top: 1px solid #ddd; padding-top: 4px; font-size: 10px; color: #666;">
      <div style="font-weight: bold; margin-bottom: 2px;">Layout:</div>
      <div style="margin: 1px 0;">Tree: Hierarchical by dependencies</div>
      <div style="margin: 1px 0;">Force: Dynamic force-directed</div>
      <div style="margin: 1px 0;">Grid: Organized grid layout</div>
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
    const resource = resources.find(r => `${r.type}.${r.name}` === nodeId);
    
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
             ${missingAttrs.map(attr => `<div style="margin: 2px 0; color: #000;">• ${attr}</div>`).join('')}
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

function initGraph(elements) {
  const container = document.getElementById('tf-graph');
  if (!container || !container.isConnected) return;

  // Don't skip if hidden - we want to initialize the graph even when sidebar is closed
  // The graph will be ready when the sidebar opens

  ensureCytoscape(() => {
    // Only create new graph if it doesn't exist or if elements have changed
    const currentElements = cy ? cy.elements().map(el => el.data('id')).sort() : [];
    const newElements = elements.map(el => el.data.id).sort();
    const elementsChanged = JSON.stringify(currentElements) !== JSON.stringify(newElements);
    
    if (!cy || elementsChanged) {
      // Clean up existing graph and controls
      if (cy) {
        cy.destroy();
        cy = null;
      }
      
      // Remove existing controls and legend
      const existingControls = container.querySelector('[data-graph-controls]');
      const existingLegend = container.querySelector('[data-graph-legend]');
      const existingDetails = document.querySelector('[data-graph-details]');
      if (existingControls) existingControls.remove();
      if (existingLegend) existingLegend.remove();
      if (existingDetails) existingDetails.remove();
      
      // Create new graph
      // Enhanced styling for better UX
      const style = [
        // Node styles
        {
          selector: 'node',
          style: {
            'background-color': '#4CAF50',
            'background-opacity': 0.8,
            'border-color': '#2E7D32',
            'border-width': 2,
            'border-opacity': 0.8,
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'width': '60px',
            'height': '60px',
            'shape': 'rectangle',
            'text-outline-color': '#000',
            'text-outline-width': 1,
            'text-outline-opacity': 0.5,
            'label': 'data(label)'
          }
        },
        // Module nodes (different color)
        {
          selector: 'node[type = "module"]',
          style: {
            'background-color': '#FF9800',
            'border-color': '#E65100',
            'shape': 'diamond',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'width': '60px',
            'height': '60px',
            'text-outline-color': '#000',
            'text-outline-width': 1,
            'text-outline-opacity': 0.5,
            'label': 'data(label)'
          }
        },
        // Edge styles
        {
          selector: 'edge',
          style: {
            'width': 3,
            'line-color': '#666',
            'target-arrow-color': '#666',
            'target-arrow-shape': 'triangle',
            'target-arrow-width': 8,
            'curve-style': 'bezier',
            'opacity': 0.7
          }
        },
        // Explicit dependency edges (depends_on)
        {
          selector: 'edge[relationshipType = "explicit"]',
          style: {
            'width': 4,
            'line-color': '#FF5722',
            'target-arrow-color': '#FF5722',
            'target-arrow-shape': 'triangle',
            'target-arrow-width': 10,
            'curve-style': 'bezier',
            'opacity': 0.9,
            'line-style': 'solid'
          }
        },
        // Implicit dependency edges (references)
        {
          selector: 'edge[relationshipType = "implicit"]',
          style: {
            'width': 2,
            'line-color': '#9C27B0',
            'target-arrow-color': '#9C27B0',
            'target-arrow-shape': 'triangle',
            'target-arrow-width': 6,
            'curve-style': 'bezier',
            'opacity': 0.6,
            'line-style': 'dashed'
          }
        },
        // Active elements (instead of hover)
        {
          selector: 'node:active',
          style: {
            'background-color': '#81C784',
            'border-color': '#4CAF50',
            'border-width': 3,
            'font-size': '14px',
            'width': '70px',
            'height': '70px'
          }
        },
        // Selected elements
        {
          selector: 'node:selected',
          style: {
            'background-color': '#2196F3',
            'border-color': '#1976D2',
            'border-width': 4
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'width': 6,
            'line-color': '#2196F3',
            'target-arrow-color': '#2196F3'
          }
        }
      ];

      // Create cytoscape instance and assign to global variable
      const cytoscapeInstance = cytoscape({
        container,
        elements,
        style,
        // Set up label mapping
        ready: function() {
          this.nodes().forEach(node => {
            node.data('label', node.data('label'));
          });
        },
        layout: {
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
        },
        minZoom: 0.1,
        maxZoom: 3
      });
      
      // Assign to global variable
      cy = cytoscapeInstance;
      console.log('Cytoscape instance created and assigned to global cy:', !!cy);
      
      // Ensure proper node styling is applied
      cy.nodes().forEach(node => {
        const nodeType = node.data('type');
        if (nodeType === 'module') {
          node.style({
            'background-color': '#FF9800',
            'border-color': '#E65100',
            'shape': 'diamond',
            'width': '60px',
            'height': '60px',
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

      // Add controls and legend
      const graphElements = createGraphControls(container);
      container.style.position = 'relative';
      container.appendChild(graphElements.controls);
      container.appendChild(graphElements.legend);
      container.appendChild(graphElements.legendControls);
      document.body.appendChild(graphElements.details);
      document.body.appendChild(graphElements.status);

      // Add event listeners for better UX
      let drawingStartNode = null;
      let isDrawingMode = false;

      // Add hover effects using event handlers
      cy.on('mouseover', 'node', function(evt) {
        const node = evt.target;
        node.style({
          'background-color': '#81C784',
          'border-color': '#4CAF50',
          'border-width': 3,
          'font-size': '14px',
          'width': '70px',
          'height': '70px'
        });
        
        const tooltip = document.createElement('div');
        tooltip.id = 'node-tooltip';
        tooltip.style.cssText = `
          position: absolute;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 10000;
          pointer-events: none;
          max-width: 200px;
          max-height: 150px;
          overflow-y: auto;
          word-wrap: break-word;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        tooltip.textContent = `Resource: ${node.data('label')}`;
        document.body.appendChild(tooltip);
      });

      cy.on('mousemove', 'node', function(evt) {
        const tooltip = document.getElementById('node-tooltip');
        if (tooltip) {
          tooltip.style.left = (evt.renderedPosition.x + 15) + 'px';
          tooltip.style.top = (evt.renderedPosition.y - 15) + 'px';
        }
      });

      // Edge hover effects
      cy.on('mouseover', 'edge', function(evt) {
        const edge = evt.target;
        edge.style({
          'width': 5,
          'line-color': '#333',
          'target-arrow-color': '#333',
          'opacity': 1
        });
      });

      cy.on('mouseout', 'edge', function(evt) {
        const edge = evt.target;
        edge.style({
          'width': 3,
          'line-color': '#666',
          'target-arrow-color': '#666',
          'opacity': 0.7
        });
      });

      // Double-click to delete edges
      cy.on('cxttap', 'edge', function(evt) {
        const edge = evt.target;
        edge.remove();
        console.log('Edge deleted, triggering save...');
        saveGraph();
      });

      // Load saved graph after cytoscape is ready
      setTimeout(() => {
        loadGraph();
      }, 1000);
      
      // Start simple auto-save timer
      setInterval(() => {
        if (cy) {
          saveGraph();
        }
      }, 30000); // Save every 30 seconds

      cy.on('mouseout', 'node', function(evt) {
        const node = evt.target;
        const nodeType = node.data('type');
        
        // Reset node styling based on type
        if (nodeType === 'module') {
          node.style({
            'background-color': '#FF9800',
            'border-color': '#E65100',
            'border-width': 2,
            'font-size': '12px',
            'width': '60px',
            'height': '60px'
          });
        } else {
          node.style({
            'background-color': '#4CAF50',
            'border-color': '#2E7D32',
            'border-width': 2,
            'font-size': '12px',
            'width': '60px',
            'height': '60px'
          });
        }
        
        const tooltip = document.getElementById('node-tooltip');
        if (tooltip) tooltip.remove();
      });

      // Draw mode interactions
      cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        const drawBtn = document.querySelector('[title*="Draw"]');
        const isDrawingMode = drawBtn && drawBtn.classList.contains('active');
        
        if (isDrawingMode) {
          if (!drawingStartNode) {
            // Start drawing - highlight the first node
            drawingStartNode = node;
            node.style({
              'background-color': '#2196F3',
              'border-color': '#1976D2',
              'border-width': 4
            });
            console.log('Draw mode: First node selected:', node.data('label'));
            
            // Update status indicator
            const statusText = document.getElementById('draw-status-text');
            if (statusText) {
              statusText.textContent = `Draw mode: First node selected - Click another node to complete relationship`;
              statusText.style.color = '#FF9800';
            }
          } else if (drawingStartNode.id() !== node.id()) {
            // Complete the relationship
            const edgeId = `edge-${Date.now()}`;
            cy.add({
              group: 'edges',
              data: {
                id: edgeId,
                source: drawingStartNode.id(),
                target: node.id(),
                relationshipType: 'user-drawn',
                label: `${drawingStartNode.data('label')} → ${node.data('label')}`
              }
            });
            
            // Style the new relationship
            cy.getElementById(edgeId).style({
              'width': 3,
              'line-color': '#9C27B0',
              'target-arrow-color': '#9C27B0',
              'target-arrow-shape': 'triangle',
              'target-arrow-width': 8,
              'opacity': 0.8,
              'curve-style': 'bezier'
            });
            
            // Reset first node styling - preserve label
            const startNodeLabel = drawingStartNode.data('label');
            drawingStartNode.style({
              'background-color': drawingStartNode.data('type') === 'module' ? '#FF9800' : '#4CAF50',
              'border-color': drawingStartNode.data('type') === 'module' ? '#E65100' : '#2E7D32',
              'border-width': 2,
              'label': startNodeLabel
            });
            
            // Reset drawing state
            drawingStartNode = null;
            console.log('Draw mode: Relationship created');
            
            // Auto-save after creating new relationship
            console.log('Relationship created, triggering save...');
            saveGraph();
            
            // Update status indicator
            const statusText = document.getElementById('draw-status-text');
            if (statusText) {
              statusText.textContent = 'Draw mode: Active - Click nodes to create relationships';
              statusText.style.color = '#2196F3';
            }
          } else if (drawingStartNode.id() === node.id()) {
            // Clicked the same node - cancel drawing
            const startNodeLabel = drawingStartNode.data('label');
            drawingStartNode.style({
              'background-color': drawingStartNode.data('type') === 'module' ? '#FF9800' : '#4CAF50',
              'border-color': drawingStartNode.data('type') === 'module' ? '#E65100' : '#2E7D32',
              'border-width': 2,
              'label': startNodeLabel
            });
            drawingStartNode = null;
            console.log('Draw mode: Drawing cancelled');
            
            // Update status indicator
            const statusText = document.getElementById('draw-status-text');
            if (statusText) {
              statusText.textContent = 'Draw mode: Active - Click nodes to create relationships';
              statusText.style.color = '#2196F3';
            }
          }
        } else {
          console.log('Selected node:', node.data('label'));
          showNodeDetails(node);
          
          // Show impact analysis if dependency data is available
          if (window.tfDependencyData) {
            showImpactAnalysis(node, window.tfDependencyData);
          }
        }
      });

      // Cancel drawing on background click
      cy.on('tap', function(evt) {
        if (evt.target === cy && drawingStartNode) {
          drawingStartNode = null;
        }
      });

      // Enable panning by default
      cy.panningEnabled(true);
      
      // Add keyboard shortcuts (only once)
      if (!window.tfGraphKeyboardBound) {
        window.tfGraphKeyboardBound = true;
        document.addEventListener('keydown', function(e) {
          if (!cy) return;
          
          switch(e.key) {
            case '=':
            case '+':
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                cy.zoom({ level: cy.zoom() * 1.2 });
              }
              break;
            case '-':
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                cy.zoom({ level: cy.zoom() / 1.2 });
              }
              break;
            case '0':
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                cy.fit();
                cy.center();
              }
              break;
          }
        });
      }

      // Run initial hierarchical tree layout for new graphs
      setTimeout(() => {
        applyHierarchicalLayout(cy);
      }, 100);
      
      // Store the layout to prevent it from being re-run
      cy.layout = cy.layout.bind(cy);
    }
    // If graph exists and elements haven't changed, do nothing - keep current state
  });
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
            const elements = buildDependencyGraph(resources, modules);
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
      #tf-graph{height:500px;background:#fafafa;border:2px solid #ddd;border-radius:8px;margin-top:6px;position:relative}
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
    title.textContent = `Resources (${resources.length})`;
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
      a.textContent = `${r.type}.${r.name}`;
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
    title.textContent = `Modules (${modules.length})`;
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
      else if (m.source) href = `https://github.com/${m.source}`;
      a.href = href;
      a.textContent = `module.${m.name}`;
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
  
  // Debounce graph updates to prevent continuous reloading
  clearTimeout(graphUpdateTimer);
  graphUpdateTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      initGraph(elements);
      
      // Try to load saved state after graph is initialized
      const savedState = loadCanvasState();
      if (savedState) {
        applyCanvasState(savedState);
      }
    });
  }, 200);
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