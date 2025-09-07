// ui.js
// UI-related functions for Terraform Resource Explorer

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
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    background: #ffffff;
    color: #374151;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  `;

  // Add focus styles
  searchInput.addEventListener('focus', () => {
    searchInput.style.borderColor = '#3b82f6';
    searchInput.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
  });

  searchInput.addEventListener('blur', () => {
    searchInput.style.borderColor = '#d1d5db';
    searchInput.style.boxShadow = 'none';
  });

  // Search functionality
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = e.target.value.toLowerCase().trim();
      filterTreeItems(query);
    }, 150);
  });

  // Keyboard shortcuts
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      filterTreeItems('');
      searchInput.blur();
    }
  });

  // Global Ctrl+F handler
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  searchContainer.appendChild(searchInput);
  header.appendChild(searchContainer);

  // Add clear search button
  const clearButton = document.createElement('button');
  clearButton.innerHTML = '✕';
  clearButton.title = 'Clear search';
  clearButton.style.cssText = `
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    font-size: 12px;
    display: none;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: background-color 0.2s ease;
  `;

  clearButton.addEventListener('mouseenter', () => {
    clearButton.style.backgroundColor = '#f3f4f6';
  });

  clearButton.addEventListener('mouseleave', () => {
    clearButton.style.backgroundColor = 'transparent';
  });

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    filterTreeItems('');
    searchInput.focus();
  });

  searchContainer.appendChild(clearButton);

  // Show/hide clear button based on input
  searchInput.addEventListener('input', (e) => {
    clearButton.style.display = e.target.value ? 'flex' : 'none';
  });

  treeContainer.appendChild(header);

  // Create main content area
  const contentArea = document.createElement('div');
  contentArea.style.cssText = `
    flex: 1;
    overflow-y: auto;
    background: #ffffff;
  `;

  // Create sections container
  const sectionsContainer = document.createElement('div');
  sectionsContainer.id = 'tree-sections';
  sectionsContainer.style.cssText = `
    padding: 16px;
  `;

  contentArea.appendChild(sectionsContainer);
  treeContainer.appendChild(contentArea);

  // Create sections for resources and modules
  createResourceSection(resources);
  createModuleSection(modules);
  createDependencySection(resources, modules);

  container.appendChild(treeContainer);

  // Store references for filtering
  window.tfTreeSections = sectionsContainer;
  window.tfAllItems = [...resources, ...modules];
}

function createResourceSection(resources) {
  const sectionsContainer = document.getElementById('tree-sections');
  if (!sectionsContainer) return;

  const section = document.createElement('div');
  section.className = 'tree-section';
  section.setAttribute('data-section', 'resources');
  section.style.cssText = `
    margin-bottom: 24px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  `;

  // Section header
  const header = document.createElement('div');
  header.className = 'section-header';
  header.style.cssText = `
    padding: 12px 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    transition: background-color 0.2s ease;
  `;

  header.addEventListener('mouseenter', () => {
    header.style.backgroundColor = '#f1f5f9';
  });

  header.addEventListener('mouseleave', () => {
    header.style.backgroundColor = '#f8fafc';
  });

  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: 600;
    color: #1f2937;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const icon = document.createElement('span');
  icon.textContent = '📦';
  icon.style.fontSize = '18px';

  const count = document.createElement('span');
  count.textContent = `Resources (${resources.length})`;
  count.style.color = '#6b7280';
  count.style.fontSize = '14px';
  count.style.fontWeight = 'normal';

  title.appendChild(icon);
  title.appendChild(count);

  const expandIcon = document.createElement('span');
  expandIcon.textContent = '▼';
  expandIcon.style.cssText = `
    color: #6b7280;
    font-size: 12px;
    transition: transform 0.2s ease;
  `;

  header.appendChild(title);
  header.appendChild(expandIcon);

  // Section content
  const content = document.createElement('div');
  content.className = 'section-content';
  content.style.cssText = `
    max-height: 300px;
    overflow-y: auto;
    transition: max-height 0.3s ease;
  `;

  // Group resources by type
  const resourcesByType = resources.reduce((acc, resource) => {
    if (!acc[resource.type]) acc[resource.type] = [];
    acc[resource.type].push(resource);
    return acc;
  }, {});

  Object.entries(resourcesByType).forEach(([type, typeResources]) => {
    const typeGroup = document.createElement('div');
    typeGroup.style.cssText = `
      border-bottom: 1px solid #f3f4f6;
      padding: 12px 16px;
    `;

    const typeHeader = document.createElement('div');
    typeHeader.style.cssText = `
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    const typeIcon = document.createElement('span');
    typeIcon.textContent = getResourceIcon(type);
    typeIcon.style.fontSize = '14px';

    typeHeader.appendChild(typeIcon);
    typeHeader.appendChild(document.createTextNode(`${type} (${typeResources.length})`));

    typeGroup.appendChild(typeHeader);

    typeResources.forEach(resource => {
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.setAttribute('data-item', `${resource.type}.${resource.name}`);
      item.style.cssText = `
        padding: 8px 12px;
        margin: 4px 0;
        background: #f9fafb;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        border-left: 3px solid ${getResourceColor(resource.type)};
        font-family: 'Courier New', monospace;
        font-size: 13px;
      `;

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f3f4f6';
        item.style.transform = 'translateX(2px)';
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '#f9fafb';
        item.style.transform = 'translateX(0)';
      });

      item.addEventListener('click', () => {
        // Clear previous selections
        document.querySelectorAll('.tree-item.selected').forEach(el => {
          el.classList.remove('selected');
          el.style.backgroundColor = '#f9fafb';
        });

        // Select current item
        item.classList.add('selected');
        item.style.backgroundColor = '#dbeafe';

        // Show resource details
        showResourceDetails(resource);
      });

      const name = document.createElement('div');
      name.textContent = resource.name;
      name.style.cssText = `
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 2px;
      `;

      const meta = document.createElement('div');
      meta.style.cssText = `
        font-size: 11px;
        color: #6b7280;
        display: flex;
        gap: 12px;
      `;

      meta.innerHTML = `
        <span>Line ${resource.line || 'Unknown'}</span>
        <span>${resource.attributes.length} attributes</span>
        ${resource.depends_on && resource.depends_on.length > 0 ? `<span>${resource.depends_on.length} deps</span>` : ''}
        ${resource.references && resource.references.length > 0 ? `<span>${resource.references.length} refs</span>` : ''}
      `;

      item.appendChild(name);
      item.appendChild(meta);
      typeGroup.appendChild(item);
    });

    content.appendChild(typeGroup);
  });

  section.appendChild(header);
  section.appendChild(content);

  // Toggle functionality
  let isExpanded = true;
  header.addEventListener('click', () => {
    isExpanded = !isExpanded;
    content.style.maxHeight = isExpanded ? '300px' : '0px';
    expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
    expandIcon.textContent = isExpanded ? '▼' : '▶';
  });

  sectionsContainer.appendChild(section);
}

function createModuleSection(modules) {
  const sectionsContainer = document.getElementById('tree-sections');
  if (!sectionsContainer) return;

  const section = document.createElement('div');
  section.className = 'tree-section';
  section.setAttribute('data-section', 'modules');
  section.style.cssText = `
    margin-bottom: 24px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  `;

  // Section header
  const header = document.createElement('div');
  header.className = 'section-header';
  header.style.cssText = `
    padding: 12px 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    transition: background-color 0.2s ease;
  `;

  header.addEventListener('mouseenter', () => {
    header.style.backgroundColor = '#f1f5f9';
  });

  header.addEventListener('mouseleave', () => {
    header.style.backgroundColor = '#f8fafc';
  });

  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: 600;
    color: #1f2937;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const icon = document.createElement('span');
  icon.textContent = '📦';
  icon.style.fontSize = '18px';

  const count = document.createElement('span');
  count.textContent = `Modules (${modules.length})`;
  count.style.color = '#6b7280';
  count.style.fontSize = '14px';
  count.style.fontWeight = 'normal';

  title.appendChild(icon);
  title.appendChild(count);

  const expandIcon = document.createElement('span');
  expandIcon.textContent = '▼';
  expandIcon.style.cssText = `
    color: #6b7280;
    font-size: 12px;
    transition: transform 0.2s ease;
  `;

  header.appendChild(title);
  header.appendChild(expandIcon);

  // Section content
  const content = document.createElement('div');
  content.className = 'section-content';
  content.style.cssText = `
    max-height: 200px;
    overflow-y: auto;
    transition: max-height 0.3s ease;
  `;

  if (modules.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = `
      padding: 24px;
      text-align: center;
      color: #6b7280;
      font-style: italic;
    `;
    empty.textContent = 'No modules found';
    content.appendChild(empty);
  } else {
    modules.forEach(module => {
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.setAttribute('data-item', `module.${module.name}`);
      item.style.cssText = `
        padding: 12px 16px;
        margin: 0;
        background: #f9fafb;
        cursor: pointer;
        transition: all 0.2s ease;
        border-left: 3px solid #f59e0b;
        font-family: 'Courier New', monospace;
        font-size: 13px;
      `;

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f3f4f6';
        item.style.transform = 'translateX(2px)';
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '#f9fafb';
        item.style.transform = 'translateX(0)';
      });

      item.addEventListener('click', () => {
        // Clear previous selections
        document.querySelectorAll('.tree-item.selected').forEach(el => {
          el.classList.remove('selected');
          el.style.backgroundColor = '#f9fafb';
        });

        // Select current item
        item.classList.add('selected');
        item.style.backgroundColor = '#fef3c7';

        // Show module details
        showModuleDetails(module);
      });

      const name = document.createElement('div');
      name.textContent = module.name;
      name.style.cssText = `
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 4px;
      `;

      const source = document.createElement('div');
      source.textContent = module.source || 'No source specified';
      source.style.cssText = `
        font-size: 11px;
        color: #6b7280;
        margin-bottom: 4px;
        word-break: break-all;
      `;

      const meta = document.createElement('div');
      meta.style.cssText = `
        font-size: 11px;
        color: #6b7280;
        display: flex;
        gap: 12px;
      `;

      meta.innerHTML = `
        <span>Line ${module.line || 'Unknown'}</span>
        ${module.depends_on && module.depends_on.length > 0 ? `<span>${module.depends_on.length} deps</span>` : ''}
        ${module.references && module.references.length > 0 ? `<span>${module.references.length} refs</span>` : ''}
      `;

      item.appendChild(name);
      item.appendChild(source);
      item.appendChild(meta);
      content.appendChild(item);
    });
  }

  section.appendChild(header);
  section.appendChild(content);

  // Toggle functionality
  let isExpanded = true;
  header.addEventListener('click', () => {
    isExpanded = !isExpanded;
    content.style.maxHeight = isExpanded ? '200px' : '0px';
    expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
    expandIcon.textContent = isExpanded ? '▼' : '▶';
  });

  sectionsContainer.appendChild(section);
}

function createDependencySection(resources, modules) {
  const sectionsContainer = document.getElementById('tree-sections');
  if (!sectionsContainer) return;

  const section = document.createElement('div');
  section.className = 'tree-section';
  section.setAttribute('data-section', 'dependencies');
  section.style.cssText = `
    margin-bottom: 24px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  `;

  // Section header
  const header = document.createElement('div');
  header.className = 'section-header';
  header.style.cssText = `
    padding: 12px 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    transition: background-color 0.2s ease;
  `;

  header.addEventListener('mouseenter', () => {
    header.style.backgroundColor = '#f1f5f9';
  });

  header.addEventListener('mouseleave', () => {
    header.style.backgroundColor = '#f8fafc';
  });

  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: 600;
    color: #1f2937;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const icon = document.createElement('span');
  icon.textContent = '🔗';
  icon.style.fontSize = '18px';

  const count = document.createElement('span');
  count.textContent = 'Dependency Tree';
  count.style.color = '#6b7280';
  count.style.fontSize = '14px';
  count.style.fontWeight = 'normal';

  title.appendChild(icon);
  title.appendChild(count);

  const expandIcon = document.createElement('span');
  expandIcon.textContent = '▼';
  expandIcon.style.cssText = `
    color: #6b7280;
    font-size: 12px;
    transition: transform 0.2s ease;
  `;

  header.appendChild(title);
  header.appendChild(expandIcon);

  // Section content
  const content = document.createElement('div');
  content.className = 'section-content';
  content.style.cssText = `
    max-height: 400px;
    overflow-y: auto;
    transition: max-height 0.3s ease;
  `;

  // Build dependency tree
  const dependencyTree = buildDependencyTree(resources, modules);
  
  if (dependencyTree.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = `
      padding: 24px;
      text-align: center;
      color: #6b7280;
      font-style: italic;
    `;
    empty.textContent = 'No dependencies found';
    content.appendChild(empty);
  } else {
    renderDependencyTree(dependencyTree, content);
  }

  section.appendChild(header);
  section.appendChild(content);

  // Toggle functionality
  let isExpanded = true;
  header.addEventListener('click', () => {
    isExpanded = !isExpanded;
    content.style.maxHeight = isExpanded ? '400px' : '0px';
    expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
    expandIcon.textContent = isExpanded ? '▼' : '▶';
  });

  sectionsContainer.appendChild(section);
}

function filterTreeItems(query) {
  const sectionsContainer = document.getElementById('tree-sections');
  if (!sectionsContainer) return;

  const allItems = sectionsContainer.querySelectorAll('.tree-item');
  
  allItems.forEach(item => {
    const itemText = item.getAttribute('data-item').toLowerCase();
    const itemElement = item.querySelector('div');
    const itemName = itemElement ? itemElement.textContent.toLowerCase() : '';
    
    const matches = !query || itemText.includes(query) || itemName.includes(query);
    
    if (matches) {
      item.style.display = 'block';
      // Highlight matching text
      if (query && itemElement) {
        itemElement.innerHTML = highlightText(itemElement.textContent, query);
      }
    } else {
      item.style.display = 'none';
    }
  });

  // Show/hide sections based on whether they have visible items
  const sections = sectionsContainer.querySelectorAll('.tree-section');
  sections.forEach(section => {
    const visibleItems = section.querySelectorAll('.tree-item[style*="block"], .tree-item:not([style*="none"])');
    const sectionContent = section.querySelector('.section-content');
    
    if (visibleItems.length === 0 && query) {
      section.style.display = 'none';
    } else {
      section.style.display = 'block';
      if (sectionContent) {
        sectionContent.style.maxHeight = 'auto';
      }
    }
  });
}

// Helper function to highlight search terms
function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark style="background: #fbbf24; padding: 1px 2px; border-radius: 2px;">$1</mark>');
}

function showResourceDetails(resource) {
  // Implementation for showing resource details
  console.log('Showing details for resource:', resource);
}

function showModuleDetails(module) {
  // Implementation for showing module details
  console.log('Showing details for module:', module);
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
