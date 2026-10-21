/**
 * app.js - Main Application Coordinator
 * Boots modules, runs live terminal clock and metric counters,
 * handles global modal controls, notifications permissions, and settings actions.
 */

class AppCoordinator {
  constructor() {
    this.init();
  }

  init() {
    this.setupTheme();
    this.startClock();
    this.updateHeaderMetrics();
    this.setupGlobalControls();
    this.setupSettingsModal();
    this.setupSettingsActions();
    if (window.lucide) window.lucide.createIcons();

    window.addEventListener('vault-updated', () => {
      this.updateHeaderMetrics();
    });
  }

  setupTheme() {
    const savedTheme = (window.storage && window.storage.getSettings().theme) || 'dark';
    this.applyTheme(savedTheme);

    const btnHeaderToggle = document.getElementById('header-theme-toggle');
    if (btnHeaderToggle) {
      btnHeaderToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        if (window.storage) window.storage.updateSettings({ theme: next });
        if (window.audio) window.audio.playClick();
      });
    }

    const btnSettingsToggle = document.getElementById('btn-theme-toggle-settings');
    if (btnSettingsToggle) {
      btnSettingsToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        if (window.storage) window.storage.updateSettings({ theme: next });
        if (window.audio) window.audio.playClick();
      });
    }
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    // Update meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#000000' : '#f9f6ed');
    }

    // Update header toggle button icon
    const btnHeaderToggle = document.getElementById('header-theme-toggle');
    if (btnHeaderToggle) {
      btnHeaderToggle.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
      btnHeaderToggle.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      if (window.lucide) window.lucide.createIcons({ root: btnHeaderToggle });
    }

    // Update settings toggle button text
    const btnSettingsToggle = document.getElementById('btn-theme-toggle-settings');
    if (btnSettingsToggle) {
      btnSettingsToggle.textContent = theme === 'dark' ? 'THEME: DARK' : 'THEME: LIGHT';
    }
  }

  startClock() {
    const clockEl = document.getElementById('header-clock');
    const updateTime = () => {
      if (!clockEl) return;
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${hrs}:${mins}:${secs}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  updateHeaderMetrics() {
    if (!window.storage) return;

    const reminders = window.storage.getReminders();
    const passwords = window.storage.getPasswords();
    const feeds = window.storage.getFeeds ? window.storage.getFeeds() : [];

    const activeReminders = reminders.filter(r => !r.isCompleted);
    const overdueReminders = activeReminders.filter(r => window.storage.getReminderDueAt(r) < Date.now());

    const remCountEl = document.getElementById('header-rem-count');
    const passCountEl = document.getElementById('header-pass-count');
    const rssCountEl = document.getElementById('header-rss-count');
    const notifStatusEl = document.getElementById('header-notif-status');

    if (remCountEl) {
      if (overdueReminders.length > 0) {
        remCountEl.innerHTML = `REM: <span class="tag-overdue-blink">${activeReminders.length} (${overdueReminders.length}!)</span>`;
      } else {
        remCountEl.textContent = `REM: ${activeReminders.length}`;
      }
    }

    if (passCountEl) {
      passCountEl.textContent = `PASS: ${passwords.length}`;
    }

    if (rssCountEl) {
      rssCountEl.textContent = `RSS: ${feeds.length}`;
    }

    if (notifStatusEl) {
      const isGranted = window.notifier && window.notifier.hasNotificationPermission();
      notifStatusEl.innerHTML = `<i data-lucide="${isGranted ? 'bell' : 'bell-off'}"></i>`;
      notifStatusEl.title = isGranted ? 'Notifications: ON' : 'Notifications: OFF (Click to Enable)';
      notifStatusEl.style.color = isGranted ? 'var(--tui-yellow)' : 'var(--tui-yellow-dim)';
      if (window.lucide) window.lucide.createIcons({ root: notifStatusEl });
    }

    // Update settings modal summary stats if visible
    const statsSummary = document.getElementById('settings-vault-stats');
    if (statsSummary) {
      statsSummary.textContent = `${activeReminders.length} REMINDERS | ${passwords.length} PASSWORDS | ${feeds.length} FEEDS`;
    }
  }

  openSettingsModal() {
    const settingsDialog = document.getElementById('settings-dialog');
    if (!settingsDialog) return;

    this.updateSettingsMetrics();
    if (window.lucide) {
      window.lucide.createIcons({ root: settingsDialog });
    }

    if (typeof settingsDialog.showModal === 'function') {
      try {
        if (!settingsDialog.open) {
          settingsDialog.showModal();
        }
      } catch (e) {
        settingsDialog.setAttribute('open', '');
      }
    } else {
      settingsDialog.setAttribute('open', '');
    }

    if (window.audio) window.audio.playClick();
  }

  closeSettingsModal() {
    const settingsDialog = document.getElementById('settings-dialog');
    if (!settingsDialog) return;

    if (typeof settingsDialog.close === 'function') {
      try {
        if (settingsDialog.open) {
          settingsDialog.close();
        }
      } catch (e) {
        settingsDialog.removeAttribute('open');
      }
    } else {
      settingsDialog.removeAttribute('open');
    }

    if (window.audio) window.audio.playClick();
  }

  updateSettingsMetrics() {
    const vaultStats = document.getElementById('settings-vault-stats');
    if (vaultStats && window.storage) {
      try {
        const vault = window.storage.getVault();
        const remCount = vault.reminders ? vault.reminders.length : 0;
        const passCount = vault.passwords ? vault.passwords.length : 0;
        const feedCount = vault.feeds ? vault.feeds.length : 0;
        vaultStats.textContent = `${remCount} REMINDERS | ${passCount} PASSWORDS | ${feedCount} FEEDS`;
      } catch (e) {
        vaultStats.textContent = 'READY (localStorage)';
      }
    }

    if (window.githubSync && typeof window.githubSync.populateSettingsForm === 'function') {
      window.githubSync.populateSettingsForm();
    }
  }

  setupSettingsModal() {
    const btnSettings = document.getElementById('header-settings-btn');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnCloseSettingsFooter = document.getElementById('btn-close-settings-footer');
    const settingsDialog = document.getElementById('settings-dialog');

    if (btnSettings) {
      btnSettings.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openSettingsModal();
      });
    }

    const closeHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeSettingsModal();
    };

    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', closeHandler);
    }

    if (btnCloseSettingsFooter) {
      btnCloseSettingsFooter.addEventListener('click', closeHandler);
    }

    if (settingsDialog) {
      settingsDialog.addEventListener('click', (e) => {
        if (e.target === settingsDialog) {
          const rect = settingsDialog.getBoundingClientRect();
          const isInside = (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
          );
          if (!isInside) {
            this.closeSettingsModal();
          }
        }
      });
    }
  }

  setupGlobalControls() {
    // Header Notification button toggle
    const btnNotif = document.getElementById('header-notif-status');
    if (btnNotif) {
      btnNotif.addEventListener('click', async () => {
        if (window.notifier) {
          const granted = await window.notifier.requestPermission();
          this.updateHeaderMetrics();
          if (granted && window.toast) window.toast.success('Notifications enabled.');
        }
      });
    }

    // Native ESC dismissal closes <dialog> elements on its own, but module
    // state still needs resetting. The alarm dialog is handled in notifier.js.
    const rssDialog = document.getElementById('rss-reader-dialog');
    if (rssDialog) {
      rssDialog.addEventListener('close', () => {
        if (window.rssViewer) window.rssViewer.currentArticleId = null;
      });
    }
  }

  setupSettingsActions() {
    // Sound Enabled toggle
    const toggleSound = document.getElementById('settings-sound-toggle');
    if (toggleSound) {
      const current = window.storage.getSettings().soundEnabled;
      toggleSound.checked = current !== false;
      toggleSound.addEventListener('change', (e) => {
        window.storage.updateSettings({ soundEnabled: e.target.checked });
        if (window.audio) window.audio.playClick();
      });
    }
  }
}

// Bootstrap once DOM is ready (or immediately if already parsed)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppCoordinator();
  });
} else {
  window.app = new AppCoordinator();
}
