// dependency.js
// Dependency analysis functions for Terraform Resource Explorer

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
  
  allItems.forEach(el => {
    const itemData = el._itemData;
    if (itemData && (itemData.depends_on || itemData.references)) {
      const deps = [...(itemData.depends_on || []), ...(itemData.references || [])];
      if (deps.includes(itemId)) {
        el.classList.add('dependency-highlight');
        el.style.background = '#fef3c7';
        el.style.borderLeft = '3px solid #f59e0b';
      }
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
  
  // Build relationship chains
  const relationshipChains = [];
  const visited = new Set();
  
  allItems.forEach(item => {
    const id = item.type ? item.type + '.' + item.name : 'module.' + item.name;
    if (!visited.has(id)) {
      const chain = { ...item, id, children: [], level: 0 };
      buildDependencyChain(id, chain, 0, visited, dependencyMap, reverseDependencyMap, itemMap);
      relationshipChains.push(chain);
    }
  });
  
  return relationshipChains;
}

function buildDependencyChain(itemId, parentItem, level, visited, dependencyMap, reverseDependencyMap, itemMap) {
  visited.add(itemId);
  const children = [];
  
  // Find what this item depends on (dependencies)
  const deps = dependencyMap.get(itemId) || [];
  deps.forEach(depId => {
    if (!visited.has(depId)) {
      const depItem = itemMap.get(depId);
      if (depItem) {
        const child = { ...depItem, id: depId, children: [], level: level + 1, relationshipType: 'dependency' };
        buildDependencyChain(depId, child, level + 1, visited, dependencyMap, reverseDependencyMap, itemMap);
        children.push(child);
      }
    }
  });
  
  // Find what depends on this item (dependents)
  const dependents = reverseDependencyMap.get(itemId) || [];
  dependents.forEach(depId => {
    if (!visited.has(depId)) {
      const depItem = itemMap.get(depId);
      if (depItem) {
        const child = { ...depItem, id: depId, children: [], level: level + 1, relationshipType: 'dependent' };
        buildDependencyChain(depId, child, level + 1, visited, dependencyMap, reverseDependencyMap, itemMap);
        children.push(child);
      }
    }
  });
  
  parentItem.children = children;
}

function createRelationshipSection(title, items, description) {
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 20px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    background: #f9fafb;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    font-weight: 600;
    color: #374151;
  `;
  header.textContent = title;
  
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 16px;
  `;
  
  if (description) {
    const desc = document.createElement('div');
    desc.style.cssText = `
      margin-bottom: 12px;
      color: #6b7280;
      font-size: 14px;
    `;
    desc.textContent = description;
    content.appendChild(desc);
  }
  
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = `
      color: #9ca3af;
      font-style: italic;
      text-align: center;
      padding: 20px;
    `;
    empty.textContent = 'No items found';
    content.appendChild(empty);
  } else {
    const list = document.createElement('div');
    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.style.cssText = `
        padding: 8px 12px;
        margin: 4px 0;
        background: #f3f4f6;
        border-radius: 4px;
        font-family: monospace;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      
      const icon = document.createElement('span');
      icon.textContent = getResourceIcon(item.type || 'module');
      icon.style.cssText = `
        font-size: 16px;
        color: ${getRelationshipColor(item, 0)};
      `;
      
      const name = document.createElement('span');
      name.textContent = item.type ? `${item.type}.${item.name}` : `module.${item.name}`;
      name.style.cssText = 'flex: 1;';
      
      const level = document.createElement('span');
      level.textContent = `Level ${item.level || 0}`;
      level.style.cssText = `
        font-size: 11px;
        color: #6b7280;
        background: #e5e7eb;
        padding: 2px 6px;
        border-radius: 3px;
      `;
      
      itemDiv.appendChild(icon);
      itemDiv.appendChild(name);
      itemDiv.appendChild(level);
      list.appendChild(itemDiv);
    });
    content.appendChild(list);
  }
  
  section.appendChild(header);
  section.appendChild(content);
  
  return section;
}

function getRelationshipColor(item, level) {
  if (item.relationshipType === 'dependency') return '#3b82f6';
  if (item.relationshipType === 'dependent') return '#ef4444';
  if (item.type === 'module') return '#f59e0b';
  return '#10b981';
}

function getResourceColor(type) {
  if (!type) return '#6b7280';
  if (type.includes('aws_')) return '#ff9900';
  if (type.includes('azurerm_')) return '#0078d4';
  if (type.includes('google_')) return '#4285f4';
  if (type.includes('kubernetes_')) return '#326ce5';
  return '#6b7280';
}

function getResourceIcon(type) {
  if (!type) return '📦';
  if (type.includes('aws_')) return '☁️';
  if (type.includes('azurerm_')) return '🔷';
  if (type.includes('google_')) return '🔵';
  if (type.includes('kubernetes_')) return '⚙️';
  if (type.includes('database') || type.includes('db')) return '🗄️';
  if (type.includes('network') || type.includes('vpc') || type.includes('subnet')) return '🌐';
  if (type.includes('security') || type.includes('kms')) return '🔒';
  return '📦';
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
  
  // Highlight edges
  cy.edges().forEach(edge => {
    const source = edge.data('source');
    const target = edge.data('target');
    const relationshipType = edge.data('relationshipType');
    
    if (source === selectedNodeId || target === selectedNodeId || 
        impactedResources.includes(source) || impactedResources.includes(target)) {
      if (relationshipType === 'explicit') {
        edge.style({
          'line-color': '#FF5722',
          'target-arrow-color': '#FF5722',
          'width': 3
        });
      } else {
        edge.style({
          'line-color': '#9C27B0',
          'target-arrow-color': '#9C27B0',
          'line-style': 'dashed',
          'width': 2
        });
      }
    } else {
      edge.style({
        'line-color': '#ccc',
        'target-arrow-color': '#ccc',
        'line-style': 'solid',
        'width': 1
      });
    }
  });
}
