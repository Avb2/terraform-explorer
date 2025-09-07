// utils.js
// Utility functions for Terraform Resource Explorer

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

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => {
      showCopyFeedback();
    }).catch(err => {
      console.error('Clipboard API failed:', err);
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const result = document.execCommand('copy');
    if (result) {
      showCopyFeedback();
    } else {
      console.error('Fallback copy failed');
    }
  } catch (err) {
    console.error('Fallback copy error:', err);
  }
  
  document.body.removeChild(textArea);
}

function showCopyFeedback() {
  // Create or update feedback element
  let feedback = document.getElementById('copy-feedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'copy-feedback';
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      z-index: 10000;
      font-size: 14px;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(feedback);
  }
  
  feedback.textContent = 'Copied to clipboard!';
  feedback.style.opacity = '1';
  
  setTimeout(() => {
    feedback.style.opacity = '0';
  }, 2000);
}
