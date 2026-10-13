/**
 * 서재 - Premium Reading App
 * Main application logic
 */

(function () {
  'use strict';

  // State
  let currentBook = null;
  let currentTOC = [];
  let islandHideTimer = null;
  let lastScrollY = 0;
  let isScrollingDown = false;

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const homeScreen = $('#home-screen');
  const readerScreen = $('#reader-screen');
  const readerContent = $('#reader-content');
  const libraryGrid = $('#library-grid');
  const emptyLibrary = $('#empty-library');
  const islandBar = $('#island-bar');
  const tocPanel = $('#toc-panel');
  const settingsPanel = $('#settings-panel');
  const overlay = $('#overlay');
  const pasteModal = $('#paste-modal');
  const fileInput = $('#file-input');
  const loading = $('#loading');
  const toastEl = $('#toast');

  // ===== Utils =====
  function showLoading(msg = '불러오는 중...') {
    loading.querySelector('.loading-text').textContent = msg;
    loading.classList.remove('hidden');
  }

  function hideLoading() {
    loading.classList.add('hidden');
  }

  function toast(msg, duration = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  function generateId() {
    return 'book_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatPercent(p) {
    return Math.round((p || 0) * 100) + '%';
  }

  // ===== Theme & Settings =====
  async function loadSettings() {
    const theme = await SeojaeDB.getSetting('theme', 'light');
    const font = await SeojaeDB.getSetting('font', "'Noto Serif KR', Georgia, serif");
    const fontSize = await SeojaeDB.getSetting('fontSize', 18);
    const lineHeight = await SeojaeDB.getSetting('lineHeight', 1.85);
    const letterSpacing = await SeojaeDB.getSetting('letterSpacing', 0.02);
    const maxWidth = await SeojaeDB.getSetting('maxWidth', 720);

    applyTheme(theme);
    applyFont(font);
    document.documentElement.style.setProperty('--font-size', fontSize + 'px');
    document.documentElement.style.setProperty('--line-height', lineHeight);
    document.documentElement.style.setProperty('--letter-spacing', letterSpacing + 'em');
    document.documentElement.style.setProperty('--max-width', maxWidth + 'px');

    // Sync UI
    $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    $$('.font-btn').forEach(b => b.classList.toggle('active', b.dataset.font === font));
    $('#font-size-slider').value = fontSize;
    $('#font-size-value').textContent = fontSize;
    $('#line-height-slider').value = lineHeight;
    $('#line-height-value').textContent = Number(lineHeight).toFixed(2);
    $('#letter-spacing-slider').value = letterSpacing;
    $('#letter-spacing-value').textContent = Number(letterSpacing).toFixed(2);
    $('#max-width-slider').value = maxWidth;
    $('#max-width-value').textContent = maxWidth;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    SeojaeDB.saveSetting('theme', theme);
  }

  function applyFont(font) {
    document.documentElement.style.setProperty('--font-body', font);
    SeojaeDB.saveSetting('font', font);
  }

  // ===== Library =====
  async function refreshLibrary() {
    const books = await SeojaeDB.getAllBooks();
    libraryGrid.innerHTML = '';

    if (books.length === 0) {
      emptyLibrary.style.display = 'block';
      return;
    }
    emptyLibrary.style.display = 'none';

    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'book-card';
      card.dataset.id = book.id;

      const progress = book.progress?.percent || 0;
      const coverEmoji = getCoverEmoji(book.format);

      card.innerHTML = `
        <button class="book-delete" data-id="${book.id}" title="삭제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="book-cover">
          <span class="cover-icon">${coverEmoji}</span>
        </div>
        <div class="book-info">
          <div class="book-title">${escapeHtml(book.title)}</div>
          <div class="book-meta">
            <span>${(book.format || '').toUpperCase()}</span>
            <span>${formatPercent(progress)}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${progress * 100}%"></div></div>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.book-delete')) return;
        openBook(book.id);
      });

      card.querySelector('.book-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`"${book.title}"을(를) 서재에서 삭제할까요?`)) {
          await SeojaeDB.deleteBook(book.id);
          toast('삭제되었습니다');
          refreshLibrary();
        }
      });

      libraryGrid.appendChild(card);
    });
  }

  function getCoverEmoji(format) {
    const map = {
      txt: '📄', md: '📝', html: '🌐', docx: '📘',
      pdf: '📕', epub: '📗'
    };
    return map[format] || '📖';
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===== Open / Parse =====
  async function handleFile(file) {
    if (!file) return;
    showLoading('파일 분석 중...');

    try {
      const parsed = await SeojaeParser.parseFile(file);
      const tocResult = SeojaeTOC.buildTOC(parsed.html);

      const book = {
        id: generateId(),
        title: parsed.title || file.name,
        format: parsed.format,
        originalName: parsed.originalName,
        html: tocResult.html,
        toc: tocResult.items,
        progress: { percent: 0, scrollY: 0 },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await SeojaeDB.saveBook(book);
      await openBook(book.id);
      toast(`"${book.title}" 열림`);
    } catch (err) {
      console.error(err);
      toast('파일을 열 수 없습니다: ' + (err.message || '알 수 없는 오류'));
    } finally {
      hideLoading();
      fileInput.value = '';
    }
  }

  async function handlePaste(title, text) {
    if (!text.trim()) {
      toast('텍스트를 입력해주세요');
      return;
    }
    showLoading('처리 중...');
    try {
      const html = SeojaeParser.textToHtml(text);
      const tocResult = SeojaeTOC.buildTOC(html);

      const book = {
        id: generateId(),
        title: title.trim() || '붙여넣은 텍스트',
        format: 'txt',
        originalName: 'paste.txt',
        html: tocResult.html,
        toc: tocResult.items,
        progress: { percent: 0, scrollY: 0 },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await SeojaeDB.saveBook(book);
      closePasteModal();
      await openBook(book.id);
      toast('읽기를 시작합니다');
    } catch (err) {
      toast('오류가 발생했습니다');
    } finally {
      hideLoading();
    }
  }

  async function openBook(id) {
    showLoading('책을 여는 중...');
    try {
      const book = await SeojaeDB.getBook(id);
      if (!book) {
        toast('책을 찾을 수 없습니다');
        return;
      }

      currentBook = book;
      currentTOC = book.toc || [];

      // Render content
      readerContent.innerHTML = book.html || '<p>내용이 없습니다.</p>';

      // Build TOC UI
      renderTOC(currentTOC);

      // Switch screen
      homeScreen.classList.remove('active');
      readerScreen.classList.add('active');

      // Restore scroll position after layout
      requestAnimationFrame(() => {
        const scrollY = book.progress?.scrollY || 0;
        window.scrollTo(0, scrollY);
        // Recalculate percent after content load
        setTimeout(() => saveCurrentProgress(), 300);
      });

      // Show island briefly
      showIsland();
      scheduleIslandHide();
    } catch (err) {
      console.error(err);
      toast('책을 열 수 없습니다');
    } finally {
      hideLoading();
    }
  }

  function renderTOC(items) {
    const list = $('#toc-list');
    list.innerHTML = '';
    if (!items || items.length === 0) {
      list.innerHTML = '<li class="toc-item" style="color:var(--text-muted)">목차가 없습니다</li>';
      return;
    }
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = `toc-item level-${item.level || 1}`;
      li.textContent = item.title;
      li.dataset.id = item.id;
      li.addEventListener('click', () => {
        const target = document.getElementById(item.id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          closePanels();
        }
      });
      list.appendChild(li);
    });
  }

  // ===== Progress =====
  function getScrollPercent() {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop;
    const scrollHeight = doc.scrollHeight - doc.clientHeight;
    if (scrollHeight <= 0) return 0;
    return Math.min(1, Math.max(0, scrollTop / scrollHeight));
  }

  function saveCurrentProgress() {
    if (!currentBook) return;
    const percent = getScrollPercent();
    const scrollY = window.scrollY;
    currentBook.progress = { percent, scrollY };
    SeojaeDB.updateProgress(currentBook.id, currentBook.progress);
  }

  // Debounced save
  let progressTimer = null;
  function onScroll() {
    if (!readerScreen.classList.contains('active')) return;

    // Island auto-hide
    const y = window.scrollY;
    if (y > lastScrollY + 10) {
      // scrolling down
      hideIsland();
    } else if (y < lastScrollY - 5) {
      showIsland();
      scheduleIslandHide();
    }
    lastScrollY = y;

    // Save progress
    clearTimeout(progressTimer);
    progressTimer = setTimeout(saveCurrentProgress, 800);
  }

  // ===== Island Bar =====
  function showIsland() {
    islandBar.classList.remove('hidden');
  }

  function hideIsland() {
    islandBar.classList.add('hidden');
  }

  function scheduleIslandHide() {
    clearTimeout(islandHideTimer);
    islandHideTimer = setTimeout(() => {
      if (readerScreen.classList.contains('active')) {
        hideIsland();
      }
    }, 2800);
  }

  // Tap to toggle island
  readerContent.addEventListener('click', (e) => {
    // Don't toggle if selecting text or clicking links
    if (window.getSelection().toString() || e.target.closest('a')) return;
    if (islandBar.classList.contains('hidden')) {
      showIsland();
      scheduleIslandHide();
    } else {
      scheduleIslandHide();
    }
  });

  // ===== Panels =====
  function openPanel(panel) {
    closePanels();
    panel.classList.add('open');
    overlay.classList.add('visible');
  }

  function closePanels() {
    tocPanel.classList.remove('open');
    settingsPanel.classList.remove('open');
    overlay.classList.remove('visible');
  }

  // ===== TTS =====
  function handleTTS() {
    if (!SeojaeTTS.isSupported()) {
      toast('이 브라우저는 TTS를 지원하지 않습니다');
      return;
    }

    const btn = $('#btn-tts');

    if (SeojaeTTS.isSpeaking()) {
      SeojaeTTS.pause();
      btn.classList.remove('tts-active');
      toast('일시정지');
      return;
    }
    if (SeojaeTTS.isPaused()) {
      SeojaeTTS.resume();
      btn.classList.add('tts-active');
      return;
    }

    // Get visible text or full content
    const text = readerContent.innerText || readerContent.textContent;
    SeojaeTTS.onStart = () => {
      btn.classList.add('tts-active');
    };
    SeojaeTTS.onEnd = () => {
      btn.classList.remove('tts-active');
    };

    const result = SeojaeTTS.toggle(text);
    if (result === 'started') {
      toast('읽어주는 중...');
    } else if (result === 'unsupported') {
      toast('TTS를 사용할 수 없습니다');
    }
  }

  // ===== Navigation =====
  function goHome() {
    saveCurrentProgress();
    SeojaeTTS.stop();
    $('#btn-tts').classList.remove('tts-active');
    readerScreen.classList.remove('active');
    homeScreen.classList.add('active');
    currentBook = null;
    closePanels();
    refreshLibrary();
    window.scrollTo(0, 0);
  }

  // ===== Paste Modal =====
  function openPasteModal() {
    pasteModal.classList.add('open');
    $('#paste-title').value = '';
    $('#paste-content').value = '';
    setTimeout(() => $('#paste-content').focus(), 100);
  }

  function closePasteModal() {
    pasteModal.classList.remove('open');
  }

  // ===== Event Bindings =====
  function bindEvents() {
    // Home actions
    $('#btn-open-file').addEventListener('click', () => fileInput.click());
    $('#btn-paste-text').addEventListener('click', openPasteModal);
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });

    // Paste modal
    $('#paste-close').addEventListener('click', closePasteModal);
    $('#paste-cancel').addEventListener('click', closePasteModal);
    $('#paste-confirm').addEventListener('click', () => {
      handlePaste($('#paste-title').value, $('#paste-content').value);
    });

    // Island buttons
    $('#btn-home').addEventListener('click', goHome);
    $('#btn-toc').addEventListener('click', () => openPanel(tocPanel));
    $('#btn-settings').addEventListener('click', () => openPanel(settingsPanel));
    $('#btn-tts').addEventListener('click', handleTTS);

    // Panel closes
    $('#toc-close').addEventListener('click', closePanels);
    $('#settings-close').addEventListener('click', closePanels);
    overlay.addEventListener('click', closePanels);

    // Settings controls
    $$('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyTheme(btn.dataset.theme);
      });
    });

    $$('.font-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.font-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFont(btn.dataset.font);
      });
    });

    $('#font-size-slider').addEventListener('input', (e) => {
      const v = e.target.value;
      document.documentElement.style.setProperty('--font-size', v + 'px');
      $('#font-size-value').textContent = v;
      SeojaeDB.saveSetting('fontSize', Number(v));
    });

    $('#line-height-slider').addEventListener('input', (e) => {
      const v = e.target.value;
      document.documentElement.style.setProperty('--line-height', v);
      $('#line-height-value').textContent = Number(v).toFixed(2);
      SeojaeDB.saveSetting('lineHeight', Number(v));
    });

    $('#letter-spacing-slider').addEventListener('input', (e) => {
      const v = e.target.value;
      document.documentElement.style.setProperty('--letter-spacing', v + 'em');
      $('#letter-spacing-value').textContent = Number(v).toFixed(2);
      SeojaeDB.saveSetting('letterSpacing', Number(v));
    });

    $('#max-width-slider').addEventListener('input', (e) => {
      const v = e.target.value;
      document.documentElement.style.setProperty('--max-width', v + 'px');
      $('#max-width-value').textContent = v;
      SeojaeDB.saveSetting('maxWidth', Number(v));
    });

    // Scroll
    window.addEventListener('scroll', onScroll, { passive: true });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePanels();
        closePasteModal();
      }
    });

    // Before unload save
    window.addEventListener('beforeunload', () => {
      if (currentBook) saveCurrentProgress();
    });

    // Visibility change (mobile)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && currentBook) saveCurrentProgress();
    });
  }

  // ===== Init =====
  async function init() {
    try {
      await SeojaeDB.openDB();
      await loadSettings();
      await refreshLibrary();
      bindEvents();
    } catch (err) {
      console.error('Init error', err);
    } finally {
      hideLoading();
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
