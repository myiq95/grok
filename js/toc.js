/**
 * Table of Contents extractor & generator
 * Supports Korean novel patterns + fallback artificial TOC
 */

function extractTOC(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${htmlContent}</div>`, 'text/html');
  const root = doc.getElementById('root');
  const items = [];
  
  // Collect headings
  const headings = root.querySelectorAll('h1, h2, h3, h4, .chapter-marker');
  headings.forEach((el, idx) => {
    let text = el.textContent.trim().replace(/\s+/g, ' ');
    if (!text || text.length > 120) return;
    
    // Ensure ID
    if (!el.id) {
      el.id = `toc-auto-${idx}`;
    }
    
    let level = 1;
    if (el.tagName === 'H2' || el.classList.contains('chapter-marker')) level = 1;
    else if (el.tagName === 'H3') level = 2;
    else if (el.tagName === 'H4') level = 3;
    else if (el.tagName === 'H1') level = 1;
    
    items.push({
      id: el.id,
      title: text,
      level
    });
  });
  
  // Also look for strong Korean chapter patterns in paragraphs if few headings
  if (items.length < 3) {
    const paragraphs = root.querySelectorAll('p');
    let found = 0;
    paragraphs.forEach((p, idx) => {
      const text = p.textContent.trim();
      if (window.SeojaeParser && window.SeojaeParser.isChapterHeading(text) && text.length < 80) {
        if (!p.id) p.id = `ch-p-${idx}`;
        // Promote to heading style conceptually
        items.push({
          id: p.id,
          title: text,
          level: 1
        });
        found++;
      }
    });
  }
  
  return items;
}

/**
 * Generate artificial TOC by splitting content into roughly equal sections
 */
function generateArtificialTOC(htmlContent, targetSections = 10) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${htmlContent}</div>`, 'text/html');
  const root = doc.getElementById('root');
  
  // Get all block elements
  const blocks = [...root.querySelectorAll('p, h1, h2, h3, h4, div, section')].filter(el => {
    return el.textContent.trim().length > 20;
  });
  
  if (blocks.length === 0) return [];
  
  const sectionSize = Math.max(1, Math.floor(blocks.length / targetSections));
  const items = [];
  
  for (let i = 0; i < blocks.length; i += sectionSize) {
    const block = blocks[i];
    if (!block.id) {
      block.id = `section-${items.length}`;
    }
    
    // Use first ~40 chars of text as title
    let title = block.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (title.length === 40) title += '…';
    if (!title) title = `구간 ${items.length + 1}`;
    
    items.push({
      id: block.id,
      title: title || `제 ${items.length + 1} 구간`,
      level: 1
    });
  }
  
  // Write back IDs into the HTML string by re-serializing
  // Note: caller should use the modified root if needed, but for simplicity
  // we return items and the original content may already have IDs from previous pass
  
  return items;
}

/**
 * Build complete TOC: prefer real headings, else artificial
 */
function buildTOC(htmlContent) {
  let items = extractTOC(htmlContent);
  
  if (items.length < 2) {
    // Generate artificial and inject IDs into content
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="root">${htmlContent}</div>`, 'text/html');
    const root = doc.getElementById('root');
    const blocks = [...root.querySelectorAll('p, h1, h2, h3, section, div')].filter(el => el.textContent.trim().length > 30);
    
    const target = Math.min(15, Math.max(5, Math.ceil(blocks.length / 8)));
    const sectionSize = Math.max(1, Math.floor(blocks.length / target));
    
    items = [];
    for (let i = 0, s = 0; i < blocks.length; i += sectionSize, s++) {
      const block = blocks[i];
      const id = `auto-section-${s}`;
      block.id = id;
      block.classList.add('chapter-marker');
      
      let title = block.textContent.trim().replace(/\s+/g, ' ').slice(0, 36);
      if (title.length >= 36) title += '…';
      items.push({ id, title: title || `구간 ${s + 1}`, level: 1 });
    }
    
    return {
      items,
      html: root.innerHTML
    };
  }
  
  return { items, html: htmlContent };
}

window.SeojaeTOC = {
  extractTOC,
  generateArtificialTOC,
  buildTOC
};
