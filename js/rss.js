/**
 * rss.js - Retro Cyberpunk TUI RSS & Atom Feed Viewer
 * Features:
 * - RSS 2.0, Atom 1.0, and RDF parsing with DOMParser
 * - Multi-proxy resilient fetching (Direct -> AllOrigins -> CorsProxy -> RSS2JSON)
 * - Feed subscription management & quick-add presets
 * - Real-time headline filtering, feed filtering, and tabs (ALL, UNREAD, STARRED)
 * - Interactive TUI Article Reader modal with next/prev navigation
 * - OPML import and export
 * - 8-bit sound effects & pure ASCII / Lucide TUI aesthetic
 */

class RSSViewer {
  constructor() {
    this.searchQuery = '';
    this.activeTab = 'all'; // 'all' | 'unread' | 'starred'
    this.selectedFeedId = 'ALL';
    this.isRefreshing = false;
    this.currentArticleId = null;

    // Popular curated preset feeds for 1-tap subscription
    this.presets = [
      { title: 'Hacker News', url: 'https://news.ycombinator.com/rss', siteUrl: 'https://news.ycombinator.com', category: 'TECH' },
      { title: 'Lobste.rs', url: 'https://lobste.rs/rss', siteUrl: 'https://lobste.rs', category: 'CODE' },
      { title: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', siteUrl: 'https://arstechnica.com', category: 'TECH' },
      { title: 'GitHub Blog', url: 'https://github.blog/feed/', siteUrl: 'https://github.blog', category: 'DEV' },
      { title: 'BBC World News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', siteUrl: 'https://www.bbc.com/news', category: 'NEWS' },
      { title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', siteUrl: 'https://www.theverge.com', category: 'TECH' },
      { title: 'Dev.to', url: 'https://dev.to/feed', siteUrl: 'https://dev.to', category: 'DEV' },
      { title: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', siteUrl: 'https://www.npr.org', category: 'NEWS' }
    ];

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.render();

    window.addEventListener('vault-updated', () => {
      this.render();
    });
  }

  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('rss-search-input');
    const searchClear = document.getElementById('rss-search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderArticlesList();
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        this.searchQuery = '';
        this.renderArticlesList();
        if (window.audio) window.audio.playClick();
      });
    }

    // Refresh all feeds button
    const btnRefresh = document.getElementById('btn-refresh-rss');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        this.refreshAllFeeds();
      });
    }

    // Toggle Add Feed accordion
    const btnToggleAdd = document.getElementById('btn-toggle-add-feed');
    const addFeedContainer = document.getElementById('add-feed-container');
    if (btnToggleAdd && addFeedContainer) {
      btnToggleAdd.addEventListener('click', () => {
        const isHidden = addFeedContainer.style.display === 'none';
        addFeedContainer.style.display = isHidden ? 'block' : 'none';
        this.setToggleBtnLabel(btnToggleAdd, isHidden ? 'HIDE' : 'FEED');
        if (isHidden) {
          // Hide manage feeds if open
          const manageContainer = document.getElementById('manage-feeds-container');
          if (manageContainer) manageContainer.style.display = 'none';
          const btnManage = document.getElementById('btn-toggle-manage-feeds');
          if (btnManage) btnManage.classList.remove('btn-highlight');
        }
        if (window.audio) window.audio.playClick();
      });
    }

    // Toggle Manage Feeds / OPML accordion
    const btnToggleManage = document.getElementById('btn-toggle-manage-feeds');
    const manageContainer = document.getElementById('manage-feeds-container');
    if (btnToggleManage && manageContainer) {
      btnToggleManage.addEventListener('click', () => {
        const isHidden = manageContainer.style.display === 'none';
        manageContainer.style.display = isHidden ? 'block' : 'none';
        btnToggleManage.classList.toggle('btn-highlight', isHidden);
        if (isHidden) {
          // Hide add feed if open
          if (addFeedContainer) addFeedContainer.style.display = 'none';
          if (btnToggleAdd) this.setToggleBtnLabel(btnToggleAdd, 'FEED');
        }
        if (window.audio) window.audio.playClick();
      });
    }

    // Mark all read button
    const btnMarkAllRead = document.getElementById('btn-mark-all-read');
    if (btnMarkAllRead) {
      btnMarkAllRead.addEventListener('click', () => {
        const feedFilter = this.selectedFeedId === 'ALL' ? null : this.selectedFeedId;
        const count = window.storage.markAllArticlesRead(feedFilter);
        if (count > 0) {
          if (window.audio) window.audio.playSuccess();
        } else {
          if (window.audio) window.audio.playClick();
        }
        this.renderArticlesList();
      });
    }

    // Feed Filter Dropdown
    const feedFilterSelect = document.getElementById('rss-feed-filter');
    if (feedFilterSelect) {
      feedFilterSelect.addEventListener('change', (e) => {
        this.selectedFeedId = e.target.value;
        this.renderArticlesList();
        if (window.audio) window.audio.playClick();
      });
    }

    // Filter Tabs (ALL / UNREAD / STARRED)
    const tabButtons = document.querySelectorAll('.rss-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.getAttribute('data-tab') || 'all';
        this.renderArticlesList();
        if (window.audio) window.audio.playClick();
      });
    });

    // Add feed form submission
    const addFeedForm = document.getElementById('add-feed-form');
    if (addFeedForm) {
      addFeedForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAddFeed();
      });
    }

    // OPML Export button
    const btnExportOPML = document.getElementById('btn-export-opml');
    if (btnExportOPML) {
      btnExportOPML.addEventListener('click', () => {
        const opml = window.storage.exportOPML();
        const blob = new Blob([opml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meil_feeds_${new Date().toISOString().slice(0, 10)}.opml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (window.audio) window.audio.playSuccess();
      });
    }

    // OPML Import button & file input
    const btnImportOPML = document.getElementById('btn-import-opml');
    const fileImportOPML = document.getElementById('file-import-opml');
    if (btnImportOPML && fileImportOPML) {
      btnImportOPML.addEventListener('click', () => {
        fileImportOPML.click();
      });

      fileImportOPML.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const result = window.storage.importOPML(event.target.result);
          if (result.success) {
            if (window.toast) window.toast.success(`OPML imported: ${result.countAdded} new feed(s)`);
            this.render();
            // Automatically fetch newly imported feeds
            this.refreshAllFeeds();
          } else {
            if (window.toast) window.toast.error(`OPML import failed: ${result.error}`);
          }
          fileImportOPML.value = '';
        };
        reader.readAsText(file);
      });
    }

    // Article list delegate actions
    const articlesContainer = document.getElementById('rss-articles-list');
    if (articlesContainer) {
      articlesContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button, [data-action]');
        const card = e.target.closest('.rss-card');
        if (!card) return;

        const articleId = card.getAttribute('data-id');
        if (!articleId) return;

        if (btn) {
          const action = btn.getAttribute('data-action');
          if (action === 'read-modal') {
            this.openReaderModal(articleId);
          } else if (action === 'toggle-star') {
            window.storage.toggleArticleStar(articleId);
            if (window.audio) window.audio.playClick();
            this.renderArticlesList();
          } else if (action === 'toggle-read') {
            window.storage.toggleArticleRead(articleId);
            if (window.audio) window.audio.playClick();
            this.renderArticlesList();
          } else if (action === 'copy-link') {
            const articles = window.storage.getArticles();
            const art = articles.find(a => a.id === articleId);
            if (art && art.link) {
              this.copyToClipboard(art.link, btn);
            }
          }
        }
      });
    }

    // Subscribed feeds list delegate actions
    const subscribedFeedsContainer = document.getElementById('subscribed-feeds-list');
    if (subscribedFeedsContainer) {
      subscribedFeedsContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-feed-action]');
        if (!btn) return;

        const action = btn.getAttribute('data-feed-action');
        const feedId = btn.getAttribute('data-feed-id');
        if (!feedId) return;

        if (action === 'delete-feed') {
          const feeds = window.storage.getFeeds();
          const feed = feeds.find(f => f.id === feedId);
          const name = feed ? feed.title : 'this feed';
          if (confirm(`CONFIRM: Unsubscribe and delete ${name}?`)) {
            window.storage.deleteFeed(feedId);
            if (this.selectedFeedId === feedId) {
              this.selectedFeedId = 'ALL';
            }
            if (window.audio) window.audio.playClick();
            this.render();
          }
        } else if (action === 'refresh-feed') {
          await this.refreshSingleFeed(feedId, btn);
        }
      });
    }

    // Setup Reader Modal Controls
    this.setupReaderModalEvents();
  }

  setupReaderModalEvents() {
    const dialog = document.getElementById('rss-reader-dialog');
    const btnClose = document.getElementById('reader-btn-close');
    const btnStar = document.getElementById('reader-btn-star');
    const btnRead = document.getElementById('reader-btn-read');
    const btnCopy = document.getElementById('reader-btn-copy');
    const btnPrev = document.getElementById('reader-btn-prev');
    const btnNext = document.getElementById('reader-btn-next');

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.closeReaderModal();
      });
    }

    if (btnStar) {
      btnStar.addEventListener('click', () => {
        if (!this.currentArticleId) return;
        const updated = window.storage.toggleArticleStar(this.currentArticleId);
        if (updated) {
          btnStar.classList.toggle('btn-starred', updated.isStarred);
        }
        if (window.audio) window.audio.playClick();
        this.renderArticlesList();
      });
    }

    if (btnRead) {
      btnRead.addEventListener('click', () => {
        if (!this.currentArticleId) return;
        const updated = window.storage.toggleArticleRead(this.currentArticleId);
        if (updated) {
          btnRead.classList.toggle('btn-highlight', updated.isRead);
          btnRead.innerHTML = `<i data-lucide="${updated.isRead ? 'check-check' : 'check'}"></i>`;
          if (window.lucide) window.lucide.createIcons({ root: btnRead });
        }
        if (window.audio) window.audio.playClick();
        this.renderArticlesList();
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        if (!this.currentArticleId) return;
        const articles = window.storage.getArticles();
        const art = articles.find(a => a.id === this.currentArticleId);
        if (art && art.link) {
          this.copyToClipboard(art.link, btnCopy);
        }
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        this.navigateReaderModal(-1);
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.navigateReaderModal(1);
      });
    }

    // Close on click outside modal backdrop
    if (dialog) {
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          const rect = dialog.getBoundingClientRect();
          const isInside = (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
          );
          if (!isInside) {
            this.closeReaderModal();
          }
        }
      });
    }
  }

  // --- Feed Subscription Logic ---
  async handleAddFeed() {
    const inputUrl = document.getElementById('feed-input-url');
    const inputTitle = document.getElementById('feed-input-title');
    const inputCategory = document.getElementById('feed-input-category');
    const btnSubmit = document.getElementById('btn-submit-feed');

    if (!inputUrl || !inputUrl.value.trim()) {
      if (window.toast) window.toast.error('Please enter a valid feed URL.');
      return;
    }

    let url = inputUrl.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const title = inputTitle ? inputTitle.value.trim() : '';
    const category = inputCategory ? inputCategory.value.trim() : 'TECH';

    // Check if feed already exists
    const existing = window.storage.getFeeds().find(f => f.url.toLowerCase() === url.toLowerCase());
    if (existing) {
      if (window.toast) window.toast.info(`Already subscribed to ${existing.title}.`);
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'CONNECTING...';
    }

    const newFeed = window.storage.addFeed({
      url,
      title: title || url,
      category
    });

    // Reset inputs
    inputUrl.value = '';
    if (inputTitle) inputTitle.value = '';

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'SUBSCRIBE FEED';
    }

    if (window.audio) window.audio.playSuccess();
    this.render();

    // Automatically trigger fetch for the new feed
    if (newFeed) {
      await this.refreshSingleFeed(newFeed.id);
    }
  }

  async addPreset(preset) {
    const existing = window.storage.getFeeds().find(f => f.url.toLowerCase() === preset.url.toLowerCase());
    if (existing) {
      if (window.toast) window.toast.info(`Already subscribed to ${preset.title}.`);
      return;
    }

    const newFeed = window.storage.addFeed({
      title: preset.title,
      url: preset.url,
      siteUrl: preset.siteUrl,
      category: preset.category
    });

    if (window.audio) window.audio.playSuccess();
    this.render();

    if (newFeed) {
      await this.refreshSingleFeed(newFeed.id);
    }
  }

  // --- Network Fetching & Parsing ---
  async fetchFeedContent(url) {
    const fetchWithTimeout = async (targetUrl, timeoutMs = 7000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    // 1. Direct fetch (fastest for CORS-enabled feeds)
    try {
      const text = await fetchWithTimeout(url, 4000);
      if (text && (text.includes('<rss') || text.includes('<feed') || text.includes('<rdf:RDF') || text.includes('<?xml'))) {
        return { raw: text, type: 'xml' };
      }
    } catch (e) {
      // Proceed to proxies
    }

    // 2. AllOrigins CORS Proxy
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const text = await fetchWithTimeout(proxyUrl, 7000);
      if (text && (text.includes('<rss') || text.includes('<feed') || text.includes('<rdf:RDF') || text.includes('<?xml'))) {
        return { raw: text, type: 'xml' };
      }
    } catch (e) {
      // Proceed to next proxy
    }

    // 3. CorsProxy.io Proxy
    try {
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
      const text = await fetchWithTimeout(proxyUrl, 7000);
      if (text && (text.includes('<rss') || text.includes('<feed') || text.includes('<rdf:RDF') || text.includes('<?xml'))) {
        return { raw: text, type: 'xml' };
      }
    } catch (e) {
      // Proceed to RSS2JSON
    }

    // 4. RSS2JSON API Gateway
    try {
      const jsonProxy = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
      const jsonText = await fetchWithTimeout(jsonProxy, 7000);
      const data = JSON.parse(jsonText);
      if (data && data.status === 'ok') {
        return { raw: data, type: 'rss2json' };
      }
    } catch (e) {
      // All gateways failed
    }

    throw new Error('Feed unreachable via direct connect and public CORS gateways.');
  }

  parseFeed(feedData, feed) {
    if (feedData.type === 'rss2json') {
      const data = feedData.raw;
      const feedTitle = feed.userCustomTitle ? feed.title : (data.feed?.title || feed.title);
      const items = Array.isArray(data.items) ? data.items : [];

      const articles = items.map(item => {
        const title = item.title || 'Untitled';
        const link = item.link || item.guid || '';
        const guid = item.guid || link || title;
        const pubDate = item.pubDate || '';
        const timestamp = pubDate ? new Date(pubDate.replace(' ', 'T')).getTime() : Date.now();
        const descRaw = item.description || item.content || '';
        const contentRaw = item.content || item.description || '';
        const author = item.author || '';

        return {
          id: 'art_' + this.hashString(guid || link || title),
          feedId: feed.id,
          feedTitle: feedTitle,
          category: feed.category || 'GENERAL',
          title: this.cleanText(title),
          link: link,
          author: this.cleanText(author),
          pubDate: pubDate || new Date(timestamp).toUTCString(),
          timestamp: isNaN(timestamp) ? Date.now() : timestamp,
          description: this.cleanSnippet(descRaw || contentRaw, 220),
          content: this.sanitizeHtml(contentRaw || descRaw),
          isRead: false,
          isStarred: false,
          createdAt: Date.now()
        };
      });

      return { feedTitle, articles };
    }

    // Standard XML parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(feedData.raw, 'text/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('XML parsing error: ' + (parserError.textContent ? parserError.textContent.slice(0, 100) : 'Malformed XML'));
    }

    const channel = doc.querySelector('channel');
    const atomFeed = doc.querySelector('feed');

    let feedTitle = feed.title;
    let articles = [];

    if (channel) {
      // RSS 2.0 / 0.9x / RDF
      const chanTitle = channel.querySelector('title');
      if (chanTitle && !feed.userCustomTitle) {
        feedTitle = chanTitle.textContent.trim() || feedTitle;
      }

      const items = channel.querySelectorAll('item');
      items.forEach(item => {
        const titleEl = item.querySelector('title');
        const linkEl = item.querySelector('link');
        const guidEl = item.querySelector('guid');
        const descEl = item.querySelector('description');
        const contentEl = item.getElementsByTagNameNS('*', 'encoded')[0] || item.querySelector('content\\:encoded') || item.querySelector('content');
        const pubDateEl = item.querySelector('pubDate') || item.querySelector('date') || item.getElementsByTagNameNS('*', 'date')[0];
        const creatorEl = item.getElementsByTagNameNS('*', 'creator')[0] || item.querySelector('dc\\:creator') || item.querySelector('author');

        const title = titleEl ? titleEl.textContent.trim() : 'Untitled';
        const link = linkEl ? linkEl.textContent.trim() : (guidEl ? guidEl.textContent.trim() : '');
        const guid = guidEl ? guidEl.textContent.trim() : (link || title);
        const rawDate = pubDateEl ? pubDateEl.textContent.trim() : '';
        const parsedTime = rawDate ? new Date(rawDate).getTime() : Date.now();
        const timestamp = isNaN(parsedTime) ? Date.now() : parsedTime;
        const descRaw = descEl ? descEl.textContent.trim() : '';
        const contentRaw = contentEl ? contentEl.textContent.trim() : descRaw;
        const author = creatorEl ? creatorEl.textContent.trim() : '';

        articles.push({
          id: 'art_' + this.hashString(guid || link || title),
          feedId: feed.id,
          feedTitle: feedTitle,
          category: feed.category || 'GENERAL',
          title: this.cleanText(title),
          link: link,
          author: this.cleanText(author),
          pubDate: rawDate || new Date(timestamp).toUTCString(),
          timestamp: timestamp,
          description: this.cleanSnippet(descRaw || contentRaw, 220),
          content: this.sanitizeHtml(contentRaw || descRaw),
          isRead: false,
          isStarred: false,
          createdAt: Date.now()
        });
      });
    } else if (atomFeed) {
      // Atom 1.0
      const atomTitle = atomFeed.querySelector('title');
      if (atomTitle && !feed.userCustomTitle) {
        feedTitle = atomTitle.textContent.trim() || feedTitle;
      }

      const entries = atomFeed.querySelectorAll('entry');
      entries.forEach(entry => {
        const titleEl = entry.querySelector('title');
        let link = '';
        const altLink = entry.querySelector('link[rel="alternate"]');
        if (altLink && altLink.getAttribute('href')) {
          link = altLink.getAttribute('href');
        } else {
          const anyLink = entry.querySelector('link');
          if (anyLink && anyLink.getAttribute('href')) {
            link = anyLink.getAttribute('href');
          } else if (anyLink) {
            link = anyLink.textContent.trim();
          }
        }

        const idEl = entry.querySelector('id');
        const guid = idEl ? idEl.textContent.trim() : link;
        const pubEl = entry.querySelector('published') || entry.querySelector('updated');
        const rawDate = pubEl ? pubEl.textContent.trim() : '';
        const parsedTime = rawDate ? new Date(rawDate).getTime() : Date.now();
        const timestamp = isNaN(parsedTime) ? Date.now() : parsedTime;

        const summaryEl = entry.querySelector('summary');
        const contentEl = entry.querySelector('content');
        const authorEl = entry.querySelector('author > name') || entry.querySelector('author');

        const title = titleEl ? titleEl.textContent.trim() : 'Untitled';
        const descRaw = summaryEl ? summaryEl.textContent.trim() : (contentEl ? contentEl.textContent.trim() : '');
        const contentRaw = contentEl ? contentEl.textContent.trim() : descRaw;
        const author = authorEl ? authorEl.textContent.trim() : '';

        articles.push({
          id: 'art_' + this.hashString(guid || link || title),
          feedId: feed.id,
          feedTitle: feedTitle,
          category: feed.category || 'GENERAL',
          title: this.cleanText(title),
          link: link,
          author: this.cleanText(author),
          pubDate: rawDate || new Date(timestamp).toUTCString(),
          timestamp: timestamp,
          description: this.cleanSnippet(descRaw || contentRaw, 220),
          content: this.sanitizeHtml(contentRaw || descRaw),
          isRead: false,
          isStarred: false,
          createdAt: Date.now()
        });
      });
    } else {
      throw new Error('Unsupported feed format. Must be RSS 2.0 or Atom 1.0.');
    }

    return { feedTitle, articles };
  }

  async refreshSingleFeed(feedId, triggerBtn = null) {
    const feeds = window.storage.getFeeds();
    const feed = feeds.find(f => f.id === feedId);
    if (!feed) return;

    if (triggerBtn) {
      triggerBtn.classList.add('btn-active');
      const icon = triggerBtn.querySelector('i');
      if (icon) icon.classList.add('spin-anim');
    }

    this.updateStatusText(`FETCHING // ${feed.title}...`);

    try {
      const feedData = await this.fetchFeedContent(feed.url);
      const { feedTitle, articles } = this.parseFeed(feedData, feed);

      window.storage.updateFeed(feedId, {
        title: feedTitle,
        lastFetchedAt: Date.now(),
        error: null
      });

      const added = window.storage.saveArticles(articles);
      this.updateStatusText(`SYNC OK // ${feedTitle}: ${articles.length} items (${added} new)`);
      if (window.audio) window.audio.playSuccess();
    } catch (err) {
      console.warn(`[RSS] Failed to fetch feed ${feed.title}:`, err);
      window.storage.updateFeed(feedId, {
        lastFetchedAt: Date.now(),
        error: err.message
      });
      this.updateStatusText(`! ERROR // ${feed.title}: ${err.message}`);
    } finally {
      if (triggerBtn) {
        triggerBtn.classList.remove('btn-active');
        const icon = triggerBtn.querySelector('i');
        if (icon) icon.classList.remove('spin-anim');
      }
      this.render();
    }
  }

  async refreshAllFeeds() {
    if (this.isRefreshing) return;
    const feeds = window.storage.getFeeds();
    if (feeds.length === 0) {
      this.updateStatusText('>_ NO FEEDS SUBSCRIBED');
      return;
    }

    this.isRefreshing = true;
    const btnRefresh = document.getElementById('btn-refresh-rss');
    if (btnRefresh) {
      const icon = btnRefresh.querySelector('i');
      if (icon) icon.classList.add('spin-anim');
      btnRefresh.classList.add('btn-active');
    }

    let totalNew = 0;
    let completed = 0;
    this.updateStatusText(`FETCHING [0/${feeds.length}] FEEDS...`);

    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      this.updateStatusText(`FETCHING [${i + 1}/${feeds.length}] // ${feed.title}...`);

      try {
        const feedData = await this.fetchFeedContent(feed.url);
        const { feedTitle, articles } = this.parseFeed(feedData, feed);

        window.storage.updateFeed(feed.id, {
          title: feedTitle,
          lastFetchedAt: Date.now(),
          error: null
        });

        const added = window.storage.saveArticles(articles);
        totalNew += added;
        completed++;
      } catch (err) {
        console.warn(`[RSS] Error refreshing ${feed.title}:`, err);
        window.storage.updateFeed(feed.id, {
          lastFetchedAt: Date.now(),
          error: err.message
        });
      }
    }

    this.isRefreshing = false;
    if (btnRefresh) {
      const icon = btnRefresh.querySelector('i');
      if (icon) icon.classList.remove('spin-anim');
      btnRefresh.classList.remove('btn-active');
    }

    const timeStr = new Date().toTimeString().slice(0, 8);
    this.updateStatusText(`SYNC COMPLETE [${timeStr}] // ${completed}/${feeds.length} OK (+${totalNew} new)`);

    if (window.audio) {
      if (totalNew > 0) window.audio.playSuccess();
      else window.audio.playClick();
    }

    this.render();
  }

  // --- Article Reader Modal ---
  openReaderModal(articleId) {
    const articles = window.storage.getArticles();
    const art = articles.find(a => a.id === articleId);
    if (!art) return;

    this.currentArticleId = articleId;

    // Automatically mark article as read when opened
    if (!art.isRead) {
      window.storage.toggleArticleRead(articleId);
      art.isRead = true;
    }

    const dialog = document.getElementById('rss-reader-dialog');
    const headerTitle = document.getElementById('reader-feed-title');
    const dateEl = document.getElementById('reader-pub-date');
    const catEl = document.getElementById('reader-category');
    const titleEl = document.getElementById('reader-item-title');
    const authorEl = document.getElementById('reader-item-author');
    const contentEl = document.getElementById('reader-content-body');
    const btnOpen = document.getElementById('reader-btn-open');
    const btnStar = document.getElementById('reader-btn-star');
    const btnRead = document.getElementById('reader-btn-read');

    if (headerTitle) headerTitle.textContent = `READER // ${art.feedTitle.toUpperCase()}`;
    if (dateEl) dateEl.textContent = this.formatDate(art.timestamp || art.pubDate);
    if (catEl) catEl.textContent = art.category || 'GENERAL';
    if (titleEl) titleEl.textContent = art.title;

    if (authorEl) {
      if (art.author) {
        authorEl.textContent = `BY: ${art.author}`;
        authorEl.style.display = 'block';
      } else {
        authorEl.style.display = 'none';
      }
    }

    if (contentEl) {
      contentEl.innerHTML = art.content || (art.description ? `<p>${art.description}</p>` : '<p class="tui-dim">No content body available.</p>');
      // Reset reader scroll to top
      contentEl.scrollTop = 0;
    }

    if (btnOpen) {
      const safeLink = this.safeUrl(art.link);
      btnOpen.href = safeLink || '#';
      btnOpen.style.display = safeLink ? 'inline-flex' : 'none';
    }

    if (btnStar) {
      btnStar.classList.toggle('btn-starred', !!art.isStarred);
    }

    if (btnRead) {
      btnRead.classList.toggle('btn-highlight', !!art.isRead);
      btnRead.innerHTML = `<i data-lucide="${art.isRead ? 'check-check' : 'check'}"></i>`;
      if (window.lucide) window.lucide.createIcons({ root: btnRead });
    }

    if (dialog) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }

    if (window.audio) window.audio.playClick();
    this.renderArticlesList();
  }

  closeReaderModal() {
    const dialog = document.getElementById('rss-reader-dialog');
    if (dialog) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
    this.currentArticleId = null;
    if (window.audio) window.audio.playClick();
  }

  navigateReaderModal(direction) {
    const articles = this.getFilteredArticles();
    if (articles.length === 0) return;

    const currentIndex = articles.findIndex(a => a.id === this.currentArticleId);
    let targetIndex = currentIndex + direction;

    if (targetIndex < 0) targetIndex = articles.length - 1;
    if (targetIndex >= articles.length) targetIndex = 0;

    const nextArt = articles[targetIndex];
    if (nextArt) {
      this.openReaderModal(nextArt.id);
    }
  }

  // --- Rendering UI ---
  render() {
    this.renderFeedFilterOptions();
    this.renderSubscribedFeedsList();
    this.renderPresets();
    this.renderArticlesList();
    this.updateStatusLine();
    if (window.lucide) window.lucide.createIcons();
  }

  renderFeedFilterOptions() {
    const select = document.getElementById('rss-feed-filter');
    if (!select) return;

    const feeds = window.storage.getFeeds();
    const articles = window.storage.getArticles();
    const currentVal = this.selectedFeedId;

    let optionsHtml = `<option value="ALL">ALL FEEDS (${feeds.length})</option>`;
    feeds.forEach(f => {
      const feedArts = articles.filter(a => a.feedId === f.id);
      const unread = feedArts.filter(a => !a.isRead).length;
      const unreadSuffix = unread > 0 ? ` [${unread} NEW]` : '';
      optionsHtml += `<option value="${this.escapeHtml(f.id)}">${this.escapeHtml(f.title)}${unreadSuffix}</option>`;
    });

    select.innerHTML = optionsHtml;

    // If the previously selected feed was deleted, fall back to ALL
    if (currentVal !== 'ALL' && !feeds.some(f => f.id === currentVal)) {
      this.selectedFeedId = 'ALL';
    }
    select.value = this.selectedFeedId;
  }

  renderSubscribedFeedsList() {
    const container = document.getElementById('subscribed-feeds-list');
    if (!container) return;

    const feeds = window.storage.getFeeds();
    const articles = window.storage.getArticles();

    if (feeds.length === 0) {
      container.innerHTML = `
        <div class="tui-box-empty">
          <div class="tui-empty-frame">
            <div class="tui-empty-title">NO FEEDS SUBSCRIBED</div>
            <div class="tui-empty-hint">Use the form or a preset below to add your first feed.</div>
          </div>
        </div>
      `;
      return;
    }

    let html = '';
    feeds.forEach(f => {
      const feedArts = articles.filter(a => a.feedId === f.id);
      const unreadCount = feedArts.filter(a => !a.isRead).length;
      const lastSyncStr = f.lastFetchedAt ? this.formatTimeAgo(f.lastFetchedAt) : 'Never';

      html += `
        <div class="tui-card feed-manage-row" data-feed-id="${this.escapeHtml(f.id)}">
          <div class="feed-info-col">
            <div class="feed-title-line">
              <span class="feed-name">> ${this.escapeHtml(f.title)}</span>
              <span class="tui-tag">${this.escapeHtml(f.category || 'GENERAL')}</span>
              ${unreadCount > 0 ? `<span class="tui-tag tag-high">${unreadCount} NEW</span>` : ''}
            </div>
            <div class="feed-url-line tui-dim">${this.escapeHtml(f.url)}</div>
            <div class="feed-meta-line tui-dim">
              <span>SYNC: ${lastSyncStr}</span>
              <span>ITEMS: ${feedArts.length}</span>
              ${f.error ? `<span class="tag-urgent">! ${this.escapeHtml(f.error)}</span>` : ''}
            </div>
          </div>
          <div class="feed-actions-col">
            <button class="tui-btn btn-icon" data-feed-action="refresh-feed" data-feed-id="${this.escapeHtml(f.id)}" title="Refresh Feed">
              <i data-lucide="refresh-cw"></i>
            </button>
            <button class="tui-btn btn-icon btn-danger" data-feed-action="delete-feed" data-feed-id="${this.escapeHtml(f.id)}" title="Unsubscribe Feed">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  renderPresets() {
    const container = document.getElementById('rss-presets-grid');
    if (!container) return;

    const subscribedUrls = new Set(window.storage.getFeeds().map(f => f.url.toLowerCase()));

    let html = '';
    this.presets.forEach((p, idx) => {
      const isSubbed = subscribedUrls.has(p.url.toLowerCase());
      html += `
        <button class="tui-btn rss-preset-chip ${isSubbed ? 'preset-subscribed' : ''}" data-preset-idx="${idx}" ${isSubbed ? 'disabled' : ''}>
          ${isSubbed ? 'OK' : '+'} ${p.title}
        </button>
      `;
    });

    container.innerHTML = html;

    // Attach click events
    container.querySelectorAll('.rss-preset-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-preset-idx'), 10);
        const preset = this.presets[idx];
        if (preset) {
          this.addPreset(preset);
        }
      });
    });
  }

  getFilteredArticles() {
    const filter = {
      feedId: this.selectedFeedId,
      unreadOnly: this.activeTab === 'unread',
      starredOnly: this.activeTab === 'starred',
      query: this.searchQuery
    };
    return window.storage.getArticles(filter);
  }

  renderArticlesList() {
    const container = document.getElementById('rss-articles-list');
    if (!container) return;

    const articles = this.getFilteredArticles();
    this.updateStatusLine();

    if (articles.length === 0) {
      container.innerHTML = `
        <div class="tui-box-empty">
          <div class="tui-empty-frame">
            <div class="tui-empty-title">NO HEADLINES FOUND</div>
            <div class="tui-empty-hint">Tap REFRESH to pull latest stories, or change the feed filter / tabs.</div>
          </div>
        </div>
      `;
      return;
    }

    let html = '';
    articles.forEach(art => {
      const isStarred = !!art.isStarred;
      const isRead = !!art.isRead;
      const timeStr = this.formatTimeAgo(art.timestamp || art.pubDate);
      // Only allow http(s) links: feed-supplied hrefs are attacker-controlled
      const safeLink = this.safeUrl(art.link);

      html += `
        <div class="tui-card rss-card ${isRead ? 'item-read' : 'item-unread'}" data-id="${this.escapeHtml(art.id)}">
          <div class="rss-card-top">
            <span class="tui-tag rss-feed-badge">${this.escapeHtml(art.feedTitle)}</span>
            <span class="tui-tag rss-cat-badge">${this.escapeHtml(art.category || 'GENERAL')}</span>
            <span class="rss-time-ago tui-dim">${timeStr}</span>
            ${!isRead ? '<span class="rss-unread-dot"># NEW</span>' : ''}
          </div>

          <div class="tui-card-title rss-headline" data-action="read-modal">
            ${this.escapeHtml(art.title)}
          </div>

          ${art.description ? `<div class="rss-snippet tui-dim">${this.escapeHtml(art.description)}</div>` : ''}

          <div class="tui-card-actions rss-card-actions">
            <button class="tui-btn btn-highlight" data-action="read-modal">
              READ
            </button>
            ${safeLink ? `
              <a href="${this.escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer" class="tui-btn btn-icon" title="Open Link in Browser">
                <i data-lucide="external-link"></i>
              </a>
            ` : ''}
            <button class="tui-btn btn-icon ${isStarred ? 'btn-starred' : ''}" data-action="toggle-star" title="${isStarred ? 'Unstar' : 'Star'}">
              <i data-lucide="star"></i>
            </button>
            <button class="tui-btn btn-icon" data-action="toggle-read" title="${isRead ? 'Mark as Unread' : 'Mark as Read'}">
              <i data-lucide="${isRead ? 'check-check' : 'check'}"></i>
            </button>
            ${safeLink ? `
              <button class="tui-btn btn-icon" data-action="copy-link" title="Copy Link URL">
                <i data-lucide="copy"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons({ root: container });
  }

  updateStatusText(text) {
    const textEl = document.getElementById('rss-status-text');
    if (textEl) textEl.textContent = text;
  }

  updateStatusLine() {
    const articles = window.storage.getArticles();
    const unread = articles.filter(a => !a.isRead).length;
    const statsEl = document.getElementById('rss-article-stats');
    if (statsEl) {
      statsEl.textContent = `${unread} UNREAD / ${articles.length} TOTAL`;
    }
  }

  // --- Helpers ---
  copyToClipboard(text, btnElement) {
    if (!navigator.clipboard) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } else {
      navigator.clipboard.writeText(text);
    }

    if (btnElement) {
      const originalHtml = btnElement.innerHTML;
      btnElement.innerHTML = '<i data-lucide="check"></i>';
      btnElement.classList.add('btn-highlight');
      if (window.lucide) window.lucide.createIcons({ root: btnElement });
      setTimeout(() => {
        btnElement.innerHTML = originalHtml;
        btnElement.classList.remove('btn-highlight');
        if (window.lucide) window.lucide.createIcons({ root: btnElement });
      }, 1500);
    }

    if (window.audio) window.audio.playClick();
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  cleanText(text) {
    if (!text) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = text;
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  cleanSnippet(htmlOrText, maxLen = 220) {
    if (!htmlOrText) return '';
    const clean = htmlOrText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen).trim() + '...';
  }

  sanitizeHtml(rawHtml) {
    if (!rawHtml) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Remove dangerous tags
    const badTags = ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button', 'noscript'];
    badTags.forEach(tag => {
      doc.querySelectorAll(tag).forEach(el => el.remove());
    });

    // Remove event handlers and sanitize attributes
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'action') {
          el.removeAttribute(name);
        }
        if (name === 'href' || name === 'src') {
          const val = attr.value.trim().toLowerCase();
          if (val.startsWith('javascript:') || val.startsWith('data:text/html')) {
            el.removeAttribute(name);
          }
        }
      });

      if (el.tagName.toLowerCase() === 'a') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return doc.body.innerHTML;
  }

  formatDate(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  formatTimeAgo(timeInput) {
    const ts = typeof timeInput === 'number' ? timeInput : new Date(timeInput).getTime();
    if (isNaN(ts) || ts <= 0) return '';

    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return '< 1m';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'Yesterday';
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  /**
   * Updates the text label of an icon+label button without wiping its icon.
   */
  setToggleBtnLabel(btn, label) {
    if (!btn) return;
    const labelEl = btn.querySelector('.btn-label');
    if (labelEl) {
      labelEl.textContent = label;
    } else {
      btn.textContent = label;
    }
  }

  /**
   * Accepts only http(s) URLs. Feed-supplied links are untrusted, so this
   * blocks javascript:, data: and other script-bearing schemes.
   */
  safeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '';
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Bootstrap RSS Viewer
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.rssViewer = new RSSViewer();
  });
} else {
  window.rssViewer = new RSSViewer();
}
