/**
 * storage.js - LocalStorage Persistence Service
 * Stores Reminders, Passwords, and Settings under a single schema version.
 */

const STORAGE_KEY = 'meil_vault_v1';
const LEGACY_STORAGE_KEY = 'memory_core_vault_v1';

class StorageService {
  constructor() {
    this.initDefaultData();
  }

  getVault() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          localStorage.setItem(STORAGE_KEY, raw);
        }
      }
      if (!raw) return this.getDefaultSchema();
      const parsed = JSON.parse(raw);
      return {
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
        feeds: Array.isArray(parsed.feeds) ? parsed.feeds : this.getDefaultFeeds(),
        rssArticles: Array.isArray(parsed.rssArticles) ? parsed.rssArticles : this.getDefaultArticles(),
        settings: Object.assign(this.getDefaultSettings(), parsed.settings || {})
      };
    } catch (err) {
      console.error('[STORAGE] Error parsing vault:', err);
      return this.getDefaultSchema();
    }
  }

  saveVault(vault) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
      window.dispatchEvent(new CustomEvent('vault-updated', { detail: vault }));
      return true;
    } catch (err) {
      console.error('[STORAGE] Error writing vault:', err);
      return false;
    }
  }

  getDefaultSettings() {
    return {
      githubToken: '',
      githubRepo: '',
      githubBranch: 'main',
      githubPath: 'memory_vault.json',
      autoSync: false,
      soundEnabled: true,
      lastSyncedAt: null,
      theme: 'dark'
    };
  }

  getDefaultFeeds() {
    return [
      {
        id: 'feed_hackernews',
        title: 'Hacker News',
        url: 'https://news.ycombinator.com/rss',
        siteUrl: 'https://news.ycombinator.com',
        category: 'TECH',
        lastFetchedAt: null,
        error: null
      },
      {
        id: 'feed_lobsters',
        title: 'Lobste.rs',
        url: 'https://lobste.rs/rss',
        siteUrl: 'https://lobste.rs',
        category: 'CODE',
        lastFetchedAt: null,
        error: null
      },
      {
        id: 'feed_arstechnica',
        title: 'Ars Technica',
        url: 'https://feeds.arstechnica.com/arstechnica/index',
        siteUrl: 'https://arstechnica.com',
        category: 'TECH',
        lastFetchedAt: null,
        error: null
      },
      {
        id: 'feed_github',
        title: 'GitHub Blog',
        url: 'https://github.blog/feed/',
        siteUrl: 'https://github.blog',
        category: 'DEV',
        lastFetchedAt: null,
        error: null
      }
    ];
  }

  getDefaultArticles() {
    const now = Date.now();
    return [
      {
        id: 'art_welcome_001',
        feedId: 'feed_hackernews',
        feedTitle: 'Hacker News',
        title: 'Welcome to MEIL RSS Feed Viewer',
        link: 'https://news.ycombinator.com',
        author: 'core_sys',
        pubDate: new Date(now - 1800000).toUTCString(),
        timestamp: now - 1800000,
        description: 'MEIL now features a built-in terminal-styled RSS & Atom Feed Reader. Tap REFRESH to fetch live articles from Hacker News, Lobste.rs, and more.',
        content: '<p>Welcome to <strong>MEIL RSS Feed Viewer</strong>!</p><p>Features included:</p><ul><li>Support for RSS 2.0, Atom 1.0, and RDF feeds</li><li>CORS-resilient background fetching</li><li>Clean distraction-free terminal article reader</li><li>Starred / Bookmarked articles filter</li><li>Search &amp; filter headlines in real-time</li><li>OPML Export and Import</li><li>Zero external dependencies</li></ul><p>Tap <strong>REFRESH</strong> in the action bar to fetch real-time updates over the network.</p>',
        isRead: false,
        isStarred: true,
        category: 'TECH',
        createdAt: now - 1800000
      },
      {
        id: 'art_welcome_002',
        feedId: 'feed_lobsters',
        feedTitle: 'Lobste.rs',
        title: 'Terminal User Interfaces and Pure Monospace Design',
        link: 'https://lobste.rs',
        author: 'tui_dev',
        pubDate: new Date(now - 3600000).toUTCString(),
        timestamp: now - 3600000,
        description: 'Exploring low-latency, touch-friendly terminal user interfaces built on modern web standards with monospace variable fonts.',
        content: '<p>Terminal User Interfaces (TUIs) bring the simplicity, speed, and focus of command-line tools to mobile and desktop browsers.</p><p>Use swipe gestures (or left/right arrow keys) to glide seamlessly between Calendar, Passwords, RSS Feeds, and Settings.</p>',
        isRead: false,
        isStarred: false,
        category: 'CODE',
        createdAt: now - 3600000
      },
      {
        id: 'art_welcome_003',
        feedId: 'feed_github',
        feedTitle: 'GitHub Blog',
        title: 'Building offline-first web apps with Web Audio and LocalStorage',
        link: 'https://github.blog',
        author: 'github',
        pubDate: new Date(now - 7200000).toUTCString(),
        timestamp: now - 7200000,
        description: 'How client-side persistence, synthesizers, and modern APIs allow building fast, autonomous software that runs everywhere.',
        content: '<p>Client-side persistence with localStorage and offline caching provides instantaneous response times with zero network latency on view changes.</p>',
        isRead: true,
        isStarred: false,
        category: 'DEV',
        createdAt: now - 7200000
      }
    ];
  }

  getDefaultSchema() {
    return {
      reminders: [],
      passwords: [],
      feeds: this.getDefaultFeeds(),
      rssArticles: this.getDefaultArticles(),
      settings: this.getDefaultSettings()
    };
  }

  initDefaultData() {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      // Pre-populate with a welcome reminder and sample pass item to help the user immediately see the TUI
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const initialVault = {
        reminders: [
          {
            id: 'rem_' + Date.now(),
            title: 'Welcome to MEIL! Swipe left/right to navigate.',
            details: 'Screen 1 is Calendar, Screen 2 is Passwords, Screen 3 is RSS Feeds, Screen 4 is Settings.',
            date: todayStr,
            time: '18:00',
            dueAt: new Date(`${todayStr}T18:00:00`).getTime() || (Date.now() + 3600000),
            repeat: 'NONE',
            priority: 'HIGH',
            isCompleted: false,
            isTriggered: false
          }
        ],
        passwords: [
          {
            id: 'pass_' + Date.now(),
            path: 'personal/sample-entry',
            username: 'user@example.com',
            password: 'CorrectHorseBatteryStaple#2026',
            notes: 'Compatible with pass CLI: ~/.password-store/personal/sample-entry.gpg',
            updatedAt: Date.now()
          }
        ],
        feeds: this.getDefaultFeeds(),
        rssArticles: this.getDefaultArticles(),
        settings: this.getDefaultSettings()
      };
      this.saveVault(initialVault);
    }
  }

  // --- Reminders CRUD ---
  getReminders() {
    return this.getVault().reminders;
  }

  getRemindersForDate(dateStr) {
    return this.getReminders().filter(r => r.date === dateStr);
  }

  addReminder(reminderData) {
    const vault = this.getVault();
    const item = {
      id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: reminderData.title.trim(),
      details: (reminderData.details || '').trim(),
      date: reminderData.date, // 'YYYY-MM-DD'
      time: reminderData.time || '09:00', // 'HH:MM'
      dueAt: reminderData.dueAt || new Date(`${reminderData.date}T${reminderData.time || '09:00'}:00`).getTime(),
      repeat: reminderData.repeat || 'NONE', // 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
      priority: reminderData.priority || 'NORMAL', // 'NORMAL' | 'HIGH' | 'URGENT'
      isCompleted: false,
      isTriggered: false,
      snoozedUntil: null,
      createdAt: Date.now()
    };
    vault.reminders.push(item);
    this.saveVault(vault);
    return item;
  }

  updateReminder(id, updates) {
    const vault = this.getVault();
    const idx = vault.reminders.findIndex(r => r.id === id);
    if (idx !== -1) {
      vault.reminders[idx] = { ...vault.reminders[idx], ...updates, updatedAt: Date.now() };
      this.saveVault(vault);
      return vault.reminders[idx];
    }
    return null;
  }

  deleteReminder(id) {
    const vault = this.getVault();
    vault.reminders = vault.reminders.filter(r => r.id !== id);
    this.saveVault(vault);
  }

  toggleReminderComplete(id) {
    const vault = this.getVault();
    const item = vault.reminders.find(r => r.id === id);
    if (item) {
      item.isCompleted = !item.isCompleted;
      this.saveVault(vault);
    }
    return item;
  }

  // --- Passwords CRUD ---
  getPasswords() {
    return this.getVault().passwords;
  }

  addPassword(passData) {
    const vault = this.getVault();
    const item = {
      id: 'pass_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      path: passData.path.trim(),
      username: (passData.username || '').trim(),
      password: passData.password || '',
      notes: (passData.notes || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    vault.passwords.push(item);
    this.saveVault(vault);
    return item;
  }

  updatePassword(id, updates) {
    const vault = this.getVault();
    const idx = vault.passwords.findIndex(p => p.id === id);
    if (idx !== -1) {
      vault.passwords[idx] = { ...vault.passwords[idx], ...updates, updatedAt: Date.now() };
      this.saveVault(vault);
      return vault.passwords[idx];
    }
    return null;
  }

  deletePassword(id) {
    const vault = this.getVault();
    vault.passwords = vault.passwords.filter(p => p.id !== id);
    this.saveVault(vault);
  }

  // --- Settings ---
  getSettings() {
    return this.getVault().settings;
  }

  updateSettings(newSettings) {
    const vault = this.getVault();
    vault.settings = { ...vault.settings, ...newSettings };
    this.saveVault(vault);
    return vault.settings;
  }

  // --- RSS Feeds CRUD ---
  getFeeds() {
    return this.getVault().feeds || [];
  }

  addFeed(feedData) {
    const vault = this.getVault();
    let url = (feedData.url || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const item = {
      id: 'feed_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: (feedData.title || '').trim() || url,
      url: url,
      siteUrl: (feedData.siteUrl || url).trim(),
      category: (feedData.category || 'GENERAL').trim().toUpperCase(),
      lastFetchedAt: null,
      error: null,
      userCustomTitle: !!(feedData.title && feedData.title.trim()),
      createdAt: Date.now()
    };

    vault.feeds.push(item);
    this.saveVault(vault);
    return item;
  }

  updateFeed(id, updates) {
    const vault = this.getVault();
    const idx = vault.feeds.findIndex(f => f.id === id);
    if (idx !== -1) {
      vault.feeds[idx] = { ...vault.feeds[idx], ...updates };
      this.saveVault(vault);
      return vault.feeds[idx];
    }
    return null;
  }

  deleteFeed(id) {
    const vault = this.getVault();
    vault.feeds = vault.feeds.filter(f => f.id !== id);
    // Also remove cached articles for this feed
    vault.rssArticles = vault.rssArticles.filter(a => a.feedId !== id);
    this.saveVault(vault);
  }

  // --- RSS Articles CRUD ---
  getArticles(filter = {}) {
    let list = this.getVault().rssArticles || [];
    if (filter.feedId && filter.feedId !== 'ALL') {
      list = list.filter(a => a.feedId === filter.feedId);
    }
    if (filter.unreadOnly) {
      list = list.filter(a => !a.isRead);
    }
    if (filter.starredOnly) {
      list = list.filter(a => !!a.isStarred);
    }
    if (filter.query) {
      const q = filter.query.toLowerCase().trim();
      list = list.filter(a =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.feedTitle && a.feedTitle.toLowerCase().includes(q))
      );
    }
    // Return sorted newest first
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  saveArticles(newArticles) {
    if (!Array.isArray(newArticles) || newArticles.length === 0) return 0;
    const vault = this.getVault();
    const existingMap = new Map();
    vault.rssArticles.forEach(a => {
      existingMap.set(a.id, a);
      if (a.link) existingMap.set(a.link, a);
    });

    let addedCount = 0;
    newArticles.forEach(art => {
      const existing = existingMap.get(art.id) || (art.link ? existingMap.get(art.link) : null);
      if (existing) {
        existing.title = art.title || existing.title;
        existing.feedTitle = art.feedTitle || existing.feedTitle;
        existing.category = art.category || existing.category;
        if (art.description) existing.description = art.description;
        if (art.content) existing.content = art.content;
      } else {
        vault.rssArticles.push(art);
        existingMap.set(art.id, art);
        if (art.link) existingMap.set(art.link, art);
        addedCount++;
      }
    });

    // Prune articles to keep maximum 300 total articles
    vault.rssArticles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (vault.rssArticles.length > 300) {
      const starred = vault.rssArticles.filter(a => a.isStarred);
      const unstarred = vault.rssArticles.filter(a => !a.isStarred);
      const remainingUnstarred = unstarred.slice(0, Math.max(0, 300 - starred.length));
      vault.rssArticles = [...starred, ...remainingUnstarred].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    this.saveVault(vault);
    return addedCount;
  }

  toggleArticleRead(id) {
    const vault = this.getVault();
    const item = vault.rssArticles.find(a => a.id === id);
    if (item) {
      item.isRead = !item.isRead;
      this.saveVault(vault);
    }
    return item;
  }

  toggleArticleStar(id) {
    const vault = this.getVault();
    const item = vault.rssArticles.find(a => a.id === id);
    if (item) {
      item.isStarred = !item.isStarred;
      this.saveVault(vault);
    }
    return item;
  }

  markAllArticlesRead(feedId = null) {
    const vault = this.getVault();
    let count = 0;
    vault.rssArticles.forEach(a => {
      if (!feedId || feedId === 'ALL' || a.feedId === feedId) {
        if (!a.isRead) {
          a.isRead = true;
          count++;
        }
      }
    });
    if (count > 0) {
      this.saveVault(vault);
    }
    return count;
  }

  clearArticles(feedId = null) {
    const vault = this.getVault();
    if (feedId && feedId !== 'ALL') {
      vault.rssArticles = vault.rssArticles.filter(a => a.feedId !== feedId);
    } else {
      vault.rssArticles = vault.rssArticles.filter(a => a.isStarred); // keep starred
    }
    this.saveVault(vault);
  }

  // --- OPML Export & Import ---
  escapeXml(unsafe) {
    return (unsafe || '').replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  exportOPML() {
    const feeds = this.getFeeds();
    const dateStr = new Date().toUTCString();
    const outlines = feeds.map(f => {
      const title = this.escapeXml(f.title || 'Untitled');
      const xmlUrl = this.escapeXml(f.url || '');
      const htmlUrl = this.escapeXml(f.siteUrl || f.url || '');
      const cat = this.escapeXml(f.category || 'GENERAL');
      return `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}" category="${cat}"/>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>MEIL RSS Subscriptions</title>
    <dateCreated>${dateStr}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
  }

  importOPML(opmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(opmlString, 'text/xml');
      const outlines = doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]');
      if (!outlines || outlines.length === 0) {
        throw new Error('No valid RSS feeds found in OPML.');
      }

      const existingFeeds = this.getFeeds();
      const existingUrls = new Set(existingFeeds.map(f => (f.url || '').toLowerCase().trim()));
      let countAdded = 0;

      outlines.forEach(outline => {
        const url = (outline.getAttribute('xmlUrl') || outline.getAttribute('xmlurl') || '').trim();
        if (!url || existingUrls.has(url.toLowerCase())) return;

        const title = (outline.getAttribute('title') || outline.getAttribute('text') || 'Untitled Feed').trim();
        const siteUrl = (outline.getAttribute('htmlUrl') || outline.getAttribute('htmlurl') || '').trim();
        const category = (outline.getAttribute('category') || 'GENERAL').trim().toUpperCase();

        this.addFeed({
          title,
          url,
          siteUrl,
          category
        });
        existingUrls.add(url.toLowerCase());
        countAdded++;
      });

      return { success: true, countAdded, total: outlines.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // --- Backup & Restore ---
  exportJSON() {
    return JSON.stringify(this.getVault(), null, 2);
  }

  exportSyncJSON() {
    const vault = this.getVault();
    const cleanSettings = { ...vault.settings };
    // Never commit secret tokens to remote repositories to avoid push protection blocks & security leaks
    delete cleanSettings.githubToken;
    const syncVault = {
      reminders: vault.reminders || [],
      passwords: vault.passwords || [],
      feeds: vault.feeds || [],
      rssArticles: vault.rssArticles || [],
      settings: cleanSettings
    };
    return JSON.stringify(syncVault, null, 2);
  }

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || (typeof parsed !== 'object')) {
        throw new Error('Invalid JSON format');
      }
      const currentVault = this.getVault();
      const currentSettings = currentVault.settings || {};

      // Preserve active local credentials if the incoming JSON doesn't provide them
      const incomingSettings = parsed.settings || {};
      const mergedSettings = Object.assign(this.getDefaultSettings(), currentSettings, incomingSettings);
      if (!incomingSettings.githubToken && currentSettings.githubToken) {
        mergedSettings.githubToken = currentSettings.githubToken;
      }
      if (!incomingSettings.githubRepo && currentSettings.githubRepo) {
        mergedSettings.githubRepo = currentSettings.githubRepo;
      }
      if (!incomingSettings.githubBranch && currentSettings.githubBranch) {
        mergedSettings.githubBranch = currentSettings.githubBranch;
      }
      if (!incomingSettings.githubPath && currentSettings.githubPath) {
        mergedSettings.githubPath = currentSettings.githubPath;
      }

      const vault = {
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
        feeds: Array.isArray(parsed.feeds) ? parsed.feeds : this.getDefaultFeeds(),
        rssArticles: Array.isArray(parsed.rssArticles) ? parsed.rssArticles : [],
        settings: mergedSettings
      };
      this.saveVault(vault);
      return {
        success: true,
        countReminders: vault.reminders.length,
        countPasswords: vault.passwords.length,
        countFeeds: vault.feeds.length
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  clearCompletedReminders() {
    const vault = this.getVault();
    const initial = vault.reminders.length;
    vault.reminders = vault.reminders.filter(r => !r.isCompleted);
    this.saveVault(vault);
    return initial - vault.reminders.length;
  }

  resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    this.initDefaultData();
  }
}

// Export singleton instance
window.storage = new StorageService();
