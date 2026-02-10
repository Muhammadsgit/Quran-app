// ===== Quran Reader App =====
(function () {
  'use strict';

  // --- State ---
  let allVerses = [];
  let surahIndex = {}; // surahNumber -> [verse, ...]
  let currentSurah = 1;
  let bookmarks = JSON.parse(localStorage.getItem('quran-bookmarks') || '[]');
  let settings = JSON.parse(localStorage.getItem('quran-settings') || '{}');

  // --- DOM refs ---
  const $ = id => document.getElementById(id);
  const mainContent = $('main-content');
  const loading = $('loading');
  const surahList = $('surah-list');
  const surahSelector = $('surah-selector');
  const sidebarFilter = $('sidebar-filter');
  const sidebar = $('sidebar');
  const sidebarOverlay = $('sidebar-overlay');
  const searchOverlay = $('search-overlay');
  const searchInput = $('search-input');
  const searchResults = $('search-results');
  const settingsPanel = $('settings-panel');
  const bookmarksPanel = $('bookmarks-panel');
  const bookmarksList = $('bookmarks-list');
  const themeToggle = $('theme-toggle');

  // ===== Arabic Normalization (ported from Swift) =====
  function normalizeArabic(text) {
    let s = text;
    // Remove BOM
    s = s.replace(/\uFEFF/g, '');
    // Superscript alef -> regular alef
    s = s.replace(/\u0670/g, '\u0627');
    // Remove diacritics (tashkeel)
    s = s.replace(/[\u064B-\u065F\u06D6-\u06ED]/g, '');
    // Normalize alef variants
    s = s.replace(/\u0671/g, '\u0627'); // alef wasla
    s = s.replace(/\u0622/g, '\u0627'); // alef madda
    s = s.replace(/\u0623/g, '\u0627'); // alef hamza above
    s = s.replace(/\u0625/g, '\u0627'); // alef hamza below
    // Remove standalone hamza
    s = s.replace(/\u0621/g, '');
    // Normalize yeh
    s = s.replace(/\u0649/g, '\u064A'); // alef maqsura -> yeh
    s = s.replace(/\u06CC/g, '\u064A'); // farsi yeh -> yeh
    // Normalize teh marbuta
    s = s.replace(/\u0629/g, '\u0647');
    // Presentation forms
    s = s.replace(/\uFE8E/g, '\u0627');
    s = s.replace(/\uFE8F/g, '\u0628');
    s = s.replace(/\uFEF0/g, '\u064A');
    return s;
  }

  // ===== Init =====
  async function init() {
    applySettings();
    buildSidebar();
    buildSurahSelector();
    bindEvents();

    try {
      const resp = await fetch('quran_data.json');
      const data = await resp.json();
      allVerses = data.verses;
      // Build surah index
      for (const v of allVerses) {
        if (!surahIndex[v.surah_number]) surahIndex[v.surah_number] = [];
        surahIndex[v.surah_number].push(v);
      }
      loading.style.display = 'none';
      handleRoute();
    } catch (err) {
      loading.innerHTML = '<span style="color:#e53935">Failed to load Quran data. Please refresh.</span>';
      console.error(err);
    }
  }

  // ===== Sidebar =====
  function buildSidebar() {
    surahList.innerHTML = SURAH_DATA.map(s =>
      `<li class="surah-item" data-surah="${s.number}">
        <span class="surah-num">${s.number}</span>
        <div class="surah-info">
          <div class="surah-name-en">${s.english}</div>
          <div class="surah-name-ar">${s.arabic}</div>
        </div>
        <span class="surah-verses">${s.verses} verses</span>
      </li>`
    ).join('');
  }

  function filterSidebar(query) {
    const q = query.toLowerCase();
    surahList.querySelectorAll('.surah-item').forEach(li => {
      const num = li.dataset.surah;
      const s = SURAH_DATA[num - 1];
      const match = !q ||
        s.english.toLowerCase().includes(q) ||
        s.arabic.includes(q) ||
        String(s.number) === q;
      li.style.display = match ? '' : 'none';
    });
  }

  function highlightSidebarItem(num) {
    surahList.querySelectorAll('.surah-item').forEach(li => {
      li.classList.toggle('active', li.dataset.surah === String(num));
    });
  }

  // ===== Surah Selector =====
  function buildSurahSelector() {
    surahSelector.innerHTML = SURAH_DATA.map(s =>
      `<option value="${s.number}">${s.number}. ${s.english}</option>`
    ).join('');
  }

  // ===== Render Surah =====
  function renderSurah(surahNum, highlightVerse) {
    currentSurah = surahNum;
    const verses = surahIndex[surahNum];
    if (!verses || verses.length === 0) return;

    const s = SURAH_DATA[surahNum - 1];
    surahSelector.value = surahNum;
    highlightSidebarItem(surahNum);
    document.title = `${s.english} (${s.arabic}) — Quran Reader`;

    // Bismillah: show for all surahs except 1 (part of verse) and 9 (no bismillah)
    const showBismillah = surahNum !== 1 && surahNum !== 9;

    let html = `
      <div class="surah-header">
        <h1>${s.arabic}</h1>
        <h2>${s.english}</h2>
        <div class="verse-count">${s.verses} Verses</div>
      </div>`;

    if (showBismillah) {
      html += `<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
    }

    html += verses.map(v => {
      const isBookmarked = bookmarks.includes(v.verse_key);
      const isHighlighted = highlightVerse && v.verse_number === highlightVerse;
      return `
        <div class="verse-card${isHighlighted ? ' highlighted' : ''}" id="verse-${v.verse_number}" data-key="${v.verse_key}">
          <span class="verse-number-badge">${v.verse_number}</span>
          <div class="verse-arabic">${v.text_arabic}</div>
          <div class="verse-english">${v.text_english}</div>
          <div class="verse-actions">
            <button class="verse-action-btn${isBookmarked ? ' bookmarked' : ''}" data-action="bookmark" data-key="${v.verse_key}" title="Bookmark">
              ${isBookmarked ? '&#9733;' : '&#9734;'} Bookmark
            </button>
            <button class="verse-action-btn" data-action="copy" data-key="${v.verse_key}" title="Copy">
              &#128203; Copy
            </button>
          </div>
        </div>`;
    }).join('');

    // Surah nav
    html += `
      <div class="surah-nav">
        <button class="surah-nav-btn" id="prev-surah" ${surahNum <= 1 ? 'disabled' : ''}>
          &#8592; ${surahNum > 1 ? SURAH_DATA[surahNum - 2].english : ''}
        </button>
        <button class="surah-nav-btn" id="next-surah" ${surahNum >= 114 ? 'disabled' : ''}>
          ${surahNum < 114 ? SURAH_DATA[surahNum].english : ''} &#8594;
        </button>
      </div>`;

    mainContent.innerHTML = html;

    // Scroll to highlighted verse after render
    if (highlightVerse) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`verse-${highlightVerse}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else {
      mainContent.scrollTop = 0;
    }

    // Close sidebar on mobile after selection
    closeSidebar();
  }

  // ===== Hash Routing =====
  function handleRoute() {
    const hash = location.hash.replace('#', '');
    if (!hash) {
      renderSurah(1);
      return;
    }
    const parts = hash.split('/');
    // #surah/36 or #surah/36/verse/12
    if (parts[0] === 'surah') {
      const sNum = parseInt(parts[1]) || 1;
      const vNum = parts[2] === 'verse' ? parseInt(parts[3]) : null;
      if (sNum >= 1 && sNum <= 114) {
        renderSurah(sNum, vNum);
      } else {
        renderSurah(1);
      }
    } else {
      renderSurah(1);
    }
  }

  function navigateToSurah(num, verse) {
    if (verse) {
      location.hash = `surah/${num}/verse/${verse}`;
    } else {
      location.hash = `surah/${num}`;
    }
  }

  // ===== Search =====
  let searchDebounce = null;

  function performSearch(query) {
    if (!query || query.length < 2) {
      searchResults.innerHTML = '<div class="search-hint">Type to search across all 6,236 verses</div>';
      return;
    }

    const results = [];
    const maxResults = 50;

    // Check for verse reference (e.g., 2:255, 36:1)
    const refMatch = query.match(/^(\d{1,3})\s*[:\.]\s*(\d{1,3})$/);
    if (refMatch) {
      const sNum = parseInt(refMatch[1]);
      const vNum = parseInt(refMatch[2]);
      const key = `${sNum}:${vNum}`;
      const verse = allVerses.find(v => v.verse_key === key);
      if (verse) {
        results.push(verse);
      }
    }

    // Text search
    if (results.length === 0) {
      const qLower = query.toLowerCase();
      const qArabic = normalizeArabic(query);

      for (const v of allVerses) {
        if (results.length >= maxResults) break;

        // English search
        if (v.text_english.toLowerCase().includes(qLower)) {
          results.push(v);
          continue;
        }
        // Arabic search (normalized)
        if (normalizeArabic(v.text_arabic).includes(qArabic)) {
          results.push(v);
        }
      }
    }

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-hint">No results found</div>';
      return;
    }

    searchResults.innerHTML = results.map(v => {
      const s = SURAH_DATA[v.surah_number - 1];
      return `
        <div class="search-result-item" data-surah="${v.surah_number}" data-verse="${v.verse_number}">
          <div class="search-result-key">${v.verse_key} — ${s.english}</div>
          <div class="search-result-arabic">${v.text_arabic}</div>
          <div class="search-result-english">${v.text_english}</div>
        </div>`;
    }).join('');
  }

  // ===== Bookmarks =====
  function toggleBookmark(key) {
    const idx = bookmarks.indexOf(key);
    if (idx >= 0) {
      bookmarks.splice(idx, 1);
    } else {
      bookmarks.push(key);
    }
    localStorage.setItem('quran-bookmarks', JSON.stringify(bookmarks));
    // Re-render current surah to update button states
    renderSurah(currentSurah);
  }

  function renderBookmarks() {
    if (bookmarks.length === 0) {
      bookmarksList.innerHTML = '<div class="bookmarks-empty">No bookmarks yet. Click the bookmark icon on any verse to save it.</div>';
      return;
    }
    bookmarksList.innerHTML = bookmarks.map(key => {
      const verse = allVerses.find(v => v.verse_key === key);
      if (!verse) return '';
      const s = SURAH_DATA[verse.surah_number - 1];
      return `
        <div class="bookmark-item" data-surah="${verse.surah_number}" data-verse="${verse.verse_number}">
          <button class="bookmark-remove" data-key="${key}" title="Remove">&times;</button>
          <div class="bookmark-key">${key} — ${s.english}</div>
          <div class="bookmark-text">${verse.text_english}</div>
        </div>`;
    }).join('');
  }

  // ===== Settings =====
  function applySettings() {
    // Theme
    if (settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (themeToggle) themeToggle.classList.add('active');
    }
    // Font size
    const size = settings.fontSize || 'medium';
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    if (size !== 'medium') document.body.classList.add(`font-${size}`);
    // Update setting option buttons
    document.querySelectorAll('.setting-option').forEach(el => {
      el.classList.toggle('active', el.dataset.size === size);
    });
  }

  function saveSetting(key, value) {
    settings[key] = value;
    localStorage.setItem('quran-settings', JSON.stringify(settings));
    applySettings();
  }

  // ===== Sidebar Toggle =====
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  }

  // ===== Copy Verse =====
  function copyVerse(key) {
    const verse = allVerses.find(v => v.verse_key === key);
    if (!verse) return;
    const s = SURAH_DATA[verse.surah_number - 1];
    const text = `${verse.text_arabic}\n\n${verse.text_english}\n\n— ${s.english} (${verse.verse_key})`;
    navigator.clipboard.writeText(text).then(() => {
      // Brief visual feedback
      const btn = document.querySelector(`[data-action="copy"][data-key="${key}"]`);
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '&#10003; Copied';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }
    });
  }

  // ===== Event Bindings =====
  function bindEvents() {
    // Hash change
    window.addEventListener('hashchange', handleRoute);

    // Sidebar item click
    surahList.addEventListener('click', e => {
      const item = e.target.closest('.surah-item');
      if (item) navigateToSurah(parseInt(item.dataset.surah));
    });

    // Sidebar filter
    sidebarFilter.addEventListener('input', e => filterSidebar(e.target.value));

    // Surah selector
    surahSelector.addEventListener('change', e => {
      navigateToSurah(parseInt(e.target.value));
    });

    // Sidebar toggle
    $('sidebar-toggle').addEventListener('click', () => {
      if (sidebar.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
    sidebarOverlay.addEventListener('click', closeSidebar);

    // Main content click delegation
    mainContent.addEventListener('click', e => {
      // Bookmark button
      const bookmarkBtn = e.target.closest('[data-action="bookmark"]');
      if (bookmarkBtn) {
        toggleBookmark(bookmarkBtn.dataset.key);
        return;
      }
      // Copy button
      const copyBtn = e.target.closest('[data-action="copy"]');
      if (copyBtn) {
        copyVerse(copyBtn.dataset.key);
        return;
      }
      // Prev/Next surah
      if (e.target.closest('#prev-surah') && currentSurah > 1) {
        navigateToSurah(currentSurah - 1);
      }
      if (e.target.closest('#next-surah') && currentSurah < 114) {
        navigateToSurah(currentSurah + 1);
      }
    });

    // Search
    $('search-btn').addEventListener('click', () => {
      searchOverlay.classList.add('active');
      searchInput.focus();
    });
    searchOverlay.addEventListener('click', e => {
      if (e.target === searchOverlay) searchOverlay.classList.remove('active');
    });
    searchInput.addEventListener('input', e => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => performSearch(e.target.value.trim()), 250);
    });
    searchResults.addEventListener('click', e => {
      const item = e.target.closest('.search-result-item');
      if (item) {
        searchOverlay.classList.remove('active');
        searchInput.value = '';
        navigateToSurah(parseInt(item.dataset.surah), parseInt(item.dataset.verse));
      }
    });

    // Settings
    $('settings-btn').addEventListener('click', () => {
      settingsPanel.classList.toggle('active');
      bookmarksPanel.classList.remove('active');
    });
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        themeToggle.classList.remove('active');
        saveSetting('theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.classList.add('active');
        saveSetting('theme', 'dark');
      }
    });
    document.querySelectorAll('.setting-option').forEach(el => {
      el.addEventListener('click', () => {
        saveSetting('fontSize', el.dataset.size);
      });
    });

    // Bookmarks panel
    $('bookmarks-btn').addEventListener('click', () => {
      bookmarksPanel.classList.toggle('active');
      settingsPanel.classList.remove('active');
      renderBookmarks();
    });
    bookmarksList.addEventListener('click', e => {
      const removeBtn = e.target.closest('.bookmark-remove');
      if (removeBtn) {
        e.stopPropagation();
        toggleBookmark(removeBtn.dataset.key);
        renderBookmarks();
        return;
      }
      const item = e.target.closest('.bookmark-item');
      if (item) {
        bookmarksPanel.classList.remove('active');
        navigateToSurah(parseInt(item.dataset.surah), parseInt(item.dataset.verse));
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      // "/" to open search (if not typing in input)
      if (e.key === '/' && !isTyping(e)) {
        e.preventDefault();
        searchOverlay.classList.add('active');
        searchInput.focus();
        return;
      }
      // Escape to close overlays
      if (e.key === 'Escape') {
        searchOverlay.classList.remove('active');
        settingsPanel.classList.remove('active');
        bookmarksPanel.classList.remove('active');
        closeSidebar();
        return;
      }
      // Arrow keys for prev/next surah (if not typing)
      if (!isTyping(e)) {
        if (e.key === 'ArrowLeft' && currentSurah > 1) {
          navigateToSurah(currentSurah - 1);
        } else if (e.key === 'ArrowRight' && currentSurah < 114) {
          navigateToSurah(currentSurah + 1);
        }
      }
    });
  }

  function isTyping(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  // ===== Start =====
  init();
})();
