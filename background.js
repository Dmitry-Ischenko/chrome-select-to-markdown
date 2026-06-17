// background service worker (Manifest V3)
// Listens for messages from popup/content script and triggers downloads.

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'save-markdown') {
    const { filename, markdown, images } = message.payload;

    // Save images first, then save markdown. Images is array of {url, filename, dataUrl}
    const downloadPromises = [];

    if (Array.isArray(images)) {
      for (const img of images) {
        // If dataUrl provided, download it directly. Otherwise use url.
        const url = img.dataUrl || img.url;
        const opts = {
          url,
          filename: img.filename,
          conflictAction: 'overwrite'
        };
        downloadPromises.push(new Promise((resolve) => {
          chrome.downloads.download(opts, (id) => {
            // ignore errors for now
            resolve(id);
          });
        }));
      }
    }

    Promise.all(downloadPromises).then(() => {
      // Now download markdown file and ask user where to save (saveAs: true)
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename, conflictAction: 'overwrite', saveAs: true }, (id) => {
        // revoke object URL after some time
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    });
  }
});
