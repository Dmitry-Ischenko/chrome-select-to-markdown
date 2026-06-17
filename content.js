// content script: captures selected HTML fragment, converts to Markdown, extracts images

// Simple HTML to Markdown converter (handles headings, paragraphs, lists, links, images, code)
function htmlToMarkdown(node, images) {
  if (!node) return '';

  const nodeType = node.nodeType;
  if (nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, ' ');
  }

  if (nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map(n => htmlToMarkdown(n, images)).join('');

  switch (tag) {
    case 'h1': return "# " + children + "\n\n";
    case 'h2': return "## " + children + "\n\n";
    case 'h3': return "### " + children + "\n\n";
    case 'h4': return "#### " + children + "\n\n";
    case 'h5': return "##### " + children + "\n\n";
    case 'h6': return "###### " + children + "\n\n";
    case 'p': return children + "\n\n";
    case 'br': return "\n";
    case 'strong': case 'b': return "**" + children + "**";
    case 'em': case 'i': return "*" + children + "*";
    case 'code': return "`" + (node.textContent || '') + "`";
    case 'pre': return "\n```\n" + (node.textContent || '') + "\n```\n\n";
    case 'a': {
      const href = node.getAttribute('href') || '';
      return `[${children}](${href})`;
    }
    case 'ul': {
      return Array.from(node.children).map(li => {
        const text = htmlToMarkdown(li, images).replace(/\n/g, ' ');
        return `- ${text}`;
      }).join('\n') + '\n\n';
    }
    case 'ol': {
      return Array.from(node.children).map((li, i) => {
        const text = htmlToMarkdown(li, images).replace(/\n/g, ' ');
        return `${i+1}. ${text}`;
      }).join('\n') + '\n\n';
    }
    case 'img': {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      const filename = `images/${Date.now()}-${Math.random().toString(36).slice(2,8)}.png`;
      images.push({ url: src, filename, element: node });
      return `![${alt}](${filename})`;
    }
    default:
      return children;
  }
}

async function captureSelection() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();

  // Create a container to hold the cloned contents
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());

  // Collect images and convert to data URLs if they are same-origin or blob
  const images = [];

  const imgs = Array.from(container.querySelectorAll('img'));
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    const filename = `images/${Date.now()}-${Math.random().toString(36).slice(2,8)}${getExtensionFromSrc(src)}`;
    images.push({ url: src, filename, element: img });
  }

  // For each image try to fetch as blob and convert to data URL (best effort)
  const imageDownloads = images.map(async (img) => {
    try {
      const resp = await fetch(img.url, { mode: 'cors' });
      if (!resp.ok) throw new Error('Network response not ok');
      const blob = await resp.blob();
      const dataUrl = await blobToDataURL(blob);
      return { ...img, dataUrl };
    } catch (e) {
      // fallback: leave url as-is (may be blocked by CORS)
      return { ...img };
    }
  });

  const resolvedImages = await Promise.all(imageDownloads);

  // Replace img srcs in container to local filenames so markdown points to them
  for (const ri of resolvedImages) {
    const el = imgs.shift();
    if (el) el.setAttribute('src', ri.filename);
    // attach dataUrl if available
    ri.dataUrl && (ri.dataUrl = ri.dataUrl);
  }

  const imagesForBackground = resolvedImages.map(it => ({ url: it.url, filename: it.filename, dataUrl: it.dataUrl }));

  // Convert container to Markdown
  const markdown = Array.from(container.childNodes).map(n => htmlToMarkdown(n, images)).join('');

  return { markdown, images: imagesForBackground };
}

function getExtensionFromSrc(src) {
  try {
    const url = new URL(src, location.href);
    const pathname = url.pathname;
    const idx = pathname.lastIndexOf('.');
    if (idx !== -1) return pathname.slice(idx);
  } catch (e) {}
  return '.png';
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Listen for messages from popup to start capture
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'capture-selection') {
    captureSelection().then(result => {
      sendResponse({ success: !!result, result });
    }).catch(err => {
      sendResponse({ success: false, error: err && err.message });
    });
    // indicate we will respond asynchronously
    return true;
  }
});
