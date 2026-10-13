/**
 * Multi-format document parser
 * Supports: txt (utf-8/cp949/ansi), md, html, docx, pdf, epub
 */

// Detect encoding for text files
async function detectAndDecodeText(arrayBuffer) {
  const encodings = ['utf-8', 'euc-kr', 'windows-1252', 'iso-8859-1'];
  
  // Try TextDecoder with different encodings
  for (const enc of encodings) {
    try {
      const decoder = new TextDecoder(enc, { fatal: true });
      const text = decoder.decode(arrayBuffer);
      // Heuristic: if mostly valid Korean/ASCII and few replacement chars
      if (!text.includes('\uFFFD') || enc === 'utf-8') {
        // Check for Korean characters or reasonable content
        const koreanRatio = (text.match(/[\uAC00-\uD7A3]/g) || []).length / Math.max(text.length, 1);
        if (enc === 'utf-8' || koreanRatio > 0.01 || !/[^\x00-\x7F\uAC00-\uD7A3\s\p{P}]/u.test(text.slice(0, 2000))) {
          return text;
        }
      }
    } catch (e) {
      // try next
    }
  }
  
  // Fallback: non-fatal utf-8
  return new TextDecoder('utf-8').decode(arrayBuffer);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text) {
  // Preserve paragraphs, detect simple headings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let html = '';
  let para = [];

  const flushPara = () => {
    if (para.length === 0) return;
    const content = para.join('<br>');
    // Detect chapter-like headings
    const plain = para.join(' ').trim();
    if (isChapterHeading(plain) && plain.length < 80) {
      html += `<h2 class="chapter-marker" id="ch-${slugify(plain)}">${escapeHtml(plain)}</h2>`;
    } else {
      html += `<p>${content}</p>`;
    }
    para = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flushPara();
    } else {
      para.push(escapeHtml(line));
    }
  }
  flushPara();
  return html || '<p></p>';
}

function isChapterHeading(text) {
  // Korean novel / document chapter patterns
  const patterns = [
    /^제\s*\d+\s*[장편부회절]/,
    /^\d+\s*[장편부회절]\s*[\.\:\-]?\s*/,
    /^제\s*[일이삼사오육칠팔구십백천만\d]+\s*[장편부회절]/,
    /^Chapter\s+\d+/i,
    /^CHAPTER\s+[IVXLCDM\d]+/i,
    /^第\s*[一二三四五六七八九十百千万\d]+\s*[章節回]/,
    /^[【\[]?\s*(프롤로그|에필로그|서문|머리말|맺음말|후기|서장|종장)\s*[】\]]?$/i,
    /^[【\[]?\s*\d+\s*[】\]]?\s*.{0,40}$/,
    /^◆\s*.{2,40}$/,
    /^▶\s*.{2,40}$/,
    /^■\s*.{2,40}$/,
  ];
  return patterns.some(p => p.test(text.trim()));
}

function slugify(text) {
  return text.slice(0, 40).replace(/\s+/g, '-').replace(/[^\w\uAC00-\uD7A3\-]/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}

// Markdown
function parseMarkdown(text) {
  if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(text);
  }
  // Fallback simple
  return textToHtml(text);
}

// HTML - extract body content, sanitize basic
function parseHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Remove scripts, styles, nav, etc.
  doc.querySelectorAll('script, style, nav, header, footer, iframe, object, embed').forEach(el => el.remove());
  
  const body = doc.body || doc.documentElement;
  // Prefer article or main
  const main = body.querySelector('article, main, .content, #content, .post, .entry') || body;
  
  // Clean attributes that could be harmful
  main.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc' || 
          (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    });
  });
  
  return main.innerHTML;
}

// DOCX via mammoth
async function parseDocx(arrayBuffer) {
  if (typeof mammoth === 'undefined') {
    throw new Error('DOCX 파서를 불러올 수 없습니다.');
  }
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

// PDF via pdf.js (UMD build for broader compatibility)
async function parsePdf(arrayBuffer) {
  let pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      script.onload = () => {
        pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
        if (pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          window.pdfjsLib = pdfjsLib;
          resolve();
        } else {
          reject(new Error('PDF 라이브러리 로드 실패'));
        }
      };
      script.onerror = () =>
        reject(new Error('PDF 라이브러리를 불러올 수 없습니다. 네트워크를 확인해주세요.'));
      document.head.appendChild(script);
    });
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let html = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    const pageText = strings.join(' ').replace(/\s+/g, ' ').trim();

    if (pageText) {
      const paragraphs = pageText
        .split(/(?<=\.)\s+(?=[A-Z가-힣])/)
        .filter((p) => p.trim());
      html += `<div class="pdf-page chapter-marker" id="page-${i}" data-page="${i}">`;
      paragraphs.forEach((p) => {
        if (isChapterHeading(p.trim()) && p.length < 100) {
          html += `<h2>${escapeHtml(p.trim())}</h2>`;
        } else {
          html += `<p>${escapeHtml(p.trim())}</p>`;
        }
      });
      html += `</div>`;
    }
  }

  return html || '<p>텍스트를 추출할 수 없는 PDF입니다.</p>';
}

// EPUB via JSZip
async function parseEpub(arrayBuffer) {
  if (typeof JSZip === 'undefined') {
    throw new Error('EPUB 파서를 불러올 수 없습니다.');
  }
  
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Find container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('유효하지 않은 EPUB 파일입니다.');
  
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const rootfile = containerDoc.querySelector('rootfile');
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) throw new Error('OPF 경로를 찾을 수 없습니다.');
  
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const opfContent = await zip.file(opfPath).async('string');
  const opfDoc = parser.parseFromString(opfContent, 'application/xml');
  
  // Get spine order
  const manifest = {};
  opfDoc.querySelectorAll('manifest item').forEach(item => {
    manifest[item.getAttribute('id')] = {
      href: item.getAttribute('href'),
      mediaType: item.getAttribute('media-type')
    };
  });
  
  const spine = [];
  opfDoc.querySelectorAll('spine itemref').forEach(ref => {
    const id = ref.getAttribute('idref');
    if (manifest[id] && (manifest[id].mediaType || '').includes('html')) {
      spine.push(manifest[id].href);
    }
  });
  
  // Title
  let title = opfDoc.querySelector('metadata title, dc\\:title, title')?.textContent || 'EPUB 도서';
  
  let html = '';
  for (let i = 0; i < spine.length; i++) {
    const href = spine[i];
    const fullPath = opfDir + href;
    const contentFile = zip.file(fullPath) || zip.file(href);
    if (!contentFile) continue;
    
    let chapterHtml = await contentFile.async('string');
    // Resolve relative images etc later if needed; for now extract text content
    const chapterDoc = parser.parseFromString(chapterHtml, 'text/html');
    chapterDoc.querySelectorAll('script, style').forEach(el => el.remove());
    
    const body = chapterDoc.body || chapterDoc.documentElement;
    // Make relative image paths work is hard offline; skip or base64 later
    body.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        img.remove(); // simplify
      }
    });
    
    html += `<section class="epub-chapter chapter-marker" id="epub-ch-${i}">${body.innerHTML}</section>`;
  }
  
  return { html: html || '<p>내용을 추출할 수 없습니다.</p>', title };
}

async function parseFile(file) {
  const name = file.name || 'untitled';
  const ext = name.split('.').pop().toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  
  let html = '';
  let title = name.replace(/\.[^.]+$/, '');
  let format = ext;
  
  switch (ext) {
    case 'txt':
    case 'text': {
      const text = await detectAndDecodeText(arrayBuffer);
      html = textToHtml(text);
      break;
    }
    case 'md':
    case 'markdown': {
      const text = await detectAndDecodeText(arrayBuffer);
      html = parseMarkdown(text);
      break;
    }
    case 'html':
    case 'htm': {
      const text = await detectAndDecodeText(arrayBuffer);
      html = parseHtml(text);
      // Try extract title
      const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m) title = m[1].trim();
      break;
    }
    case 'docx': {
      html = await parseDocx(arrayBuffer);
      break;
    }
    case 'pdf': {
      html = await parsePdf(arrayBuffer);
      break;
    }
    case 'epub': {
      const result = await parseEpub(arrayBuffer);
      html = result.html;
      if (result.title) title = result.title;
      break;
    }
    default: {
      // Try as text
      const text = await detectAndDecodeText(arrayBuffer);
      html = textToHtml(text);
      format = 'txt';
    }
  }
  
  return { html, title, format, originalName: name };
}

window.SeojaeParser = {
  parseFile,
  detectAndDecodeText,
  textToHtml,
  isChapterHeading
};
