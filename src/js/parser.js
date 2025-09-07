// parser.js
// HCL parsing and extraction functions for Terraform Resource Explorer

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
