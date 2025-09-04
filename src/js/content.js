// content.js
console.log('content.js: Starting injection');

(function injectOnce() {
  if (document.getElementById('tf-explorer-root')) {
    console.log('content.js: Already injected');
    return;
  }
  fetch(chrome.runtime.getURL('src/index.html'))
    .then(r => {
      console.log('content.js: Fetched index.html, status:', r.status);
      if (!r.ok) throw new Error('Failed to fetch index.html');
      return r.text();
    })
    .then(html => {
      console.log('content.js: Injecting HTML');
      const div = document.createElement('div');
      div.id = 'tf-explorer-root';
      div.innerHTML = html;
      document.body.appendChild(div);
      console.log('content.js: HTML injected successfully');
    })
    .catch(err => console.error('content.js: Error during injection', err));
})();
