// graph.js
// Graph visualization functions for Terraform Resource Explorer

function initGraph(elements) {
  // Graph functionality removed - using clean tree view instead
  return;
}

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
    // Reset all mode buttons
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.style.background = '#fff';
      btn.style.color = '#333';
    });
    
    // Set pan mode
    panBtn.style.background = '#007bff';
    panBtn.style.color = '#fff';
    
    // Disable drawing mode
    if (cy) {
      cy.userPanningEnabled(true);
      cy.userZoomingEnabled(true);
      cy.boxSelectionEnabled(false);
    }
  };

  // Draw mode toggle
  const drawBtn = document.createElement('button');
  drawBtn.innerHTML = 'Draw';
  drawBtn.title = 'Draw Mode';
  drawBtn.setAttribute('data-mode', 'draw');
  drawBtn.style.cssText = panBtn.style.cssText;
  drawBtn.onmouseover = () => drawBtn.style.background = '#f0f0f0';
  drawBtn.onmouseout = () => drawBtn.style.background = '#fff';
  drawBtn.onclick = () => {
    // Reset all mode buttons
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.style.background = '#fff';
      btn.style.color = '#333';
    });
    
    // Set draw mode
    drawBtn.style.background = '#28a745';
    drawBtn.style.color = '#fff';
    
    // Enable drawing mode
    if (cy) {
      cy.userPanningEnabled(false);
      cy.userZoomingEnabled(false);
      cy.boxSelectionEnabled(true);
    }
  };

  centerSection.appendChild(panBtn);
  centerSection.appendChild(drawBtn);

  // Create right section (layout controls)
  const rightSection = document.createElement('div');
  rightSection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // Add layout controls
  const layoutDiv = addLayoutControls(container);
  if (layoutDiv) {
    rightSection.appendChild(layoutDiv);
  }

  toolbarDiv.appendChild(leftSection);
  toolbarDiv.appendChild(centerSection);
  toolbarDiv.appendChild(rightSection);

  container.appendChild(toolbarDiv);
  container.appendChild(legendControlsDiv);
  container.appendChild(legendDiv);

  return toolbarDiv;
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

// --------- Hierarchical Tree Layout ----------
function createHierarchicalLayout(elements) {
  const nodes = elements.filter(el => el.data.id && !el.data.source);
  const edges = elements.filter(el => el.data.source && el.data.target);
  
  // Build adjacency list
  const adjacencyList = new Map();
  nodes.forEach(node => {
    adjacencyList.set(node.data.id, []);
  });
  
  edges.forEach(edge => {
    const source = edge.data.source;
    const target = edge.data.target;
    if (adjacencyList.has(source)) {
      adjacencyList.get(source).push(target);
    }
  });
  
  // Find root nodes (no incoming edges)
  const rootNodes = [];
  nodes.forEach(node => {
    const hasIncoming = edges.some(edge => edge.data.target === node.data.id);
    if (!hasIncoming) {
      rootNodes.push(node.data.id);
    }
  });
  
  // If no root nodes found, use first node
  if (rootNodes.length === 0 && nodes.length > 0) {
    rootNodes.push(nodes[0].data.id);
  }
  
  // Calculate levels using BFS
  const levels = new Map();
  const visited = new Set();
  
  function bfs(startNode, startLevel) {
    const queue = [{ node: startNode, level: startLevel }];
    
    while (queue.length > 0) {
      const { node, level } = queue.shift();
      
      if (visited.has(node)) continue;
      visited.add(node);
      levels.set(node, level);
      
      const children = adjacencyList.get(node) || [];
      children.forEach(child => {
        if (!visited.has(child)) {
          queue.push({ node: child, level: level + 1 });
        }
      });
    }
  }
  
  // Start BFS from each root node
  rootNodes.forEach((rootNode, index) => {
    bfs(rootNode, 0);
  });
  
  // Handle unvisited nodes (disconnected components)
  nodes.forEach(node => {
    if (!visited.has(node.data.id)) {
      levels.set(node.data.id, 0);
    }
  });
  
  return { levels, rootNodes };
}

function applyHierarchicalLayout(cy) {
  if (!cy) return;
  
  const elements = cy.json().elements;
  const { levels } = createHierarchicalLayout(elements);
  
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
