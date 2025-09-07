// main.js
// Main initialization and logic for Terraform Resource Explorer

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
