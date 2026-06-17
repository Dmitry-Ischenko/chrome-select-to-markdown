document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  btn.addEventListener('click', async () => {
    status.textContent = 'Requesting selection...';

    // Ask the active tab's content script to capture selection
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      status.textContent = 'No active tab';
      return;
    }
    function handleResponse(response) {
      if (chrome.runtime.lastError) {
        status.textContent = 'Content script not found: ' + chrome.runtime.lastError.message;
        return;
      }
      if (!response) {
        status.textContent = 'No selection or content script did not respond.';
        return;
      }
      if (!response.success) {
        status.textContent = 'Error: ' + (response.error || 'unknown');
        return;
      }

      const { markdown, images } = response.result;
      const filename = 'selection-' + Date.now() + '.md';

      chrome.runtime.sendMessage({ type: 'save-markdown', payload: { filename, markdown, images } });
      status.textContent = 'Saving... check downloads.';
    }

    // Try sending message; if no receiver, try to inject content script then retry
    chrome.tabs.sendMessage(tab.id, { type: 'capture-selection' }, (response) => {
      if (chrome.runtime.lastError) {
        // Try to inject content script dynamically (may fail on restricted pages)
        status.textContent = 'Injecting content script...';
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, () => {
          if (chrome.runtime.lastError) {
            status.textContent = 'Cannot inject content script: ' + chrome.runtime.lastError.message;
            return;
          }
          // Retry messaging after injection
          chrome.tabs.sendMessage(tab.id, { type: 'capture-selection' }, handleResponse);
        });
        return;
      }
      handleResponse(response);
    });
  });
});
