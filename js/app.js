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
    this.startClock();
    this.updateHeaderMetrics();
    this.setupGlobalControls();
    this.setupSettingsActions();
    if (window.lucide) window.lucide.createIcons();

    window.addEventListener('vault-updated', () => {
      this.updateHeaderMetrics();
    });
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

    const activeReminders = reminders.filter(r => !r.isCompleted);
    const overdueReminders = activeReminders.filter(r => (r.snoozedUntil || r.dueAt) < Date.now());

    const remCountEl = document.getElementById('header-rem-count');
    const passCountEl = document.getElementById('header-pass-count');
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

    if (notifStatusEl) {
      const isGranted = window.notifier && window.notifier.hasNotificationPermission();
      notifStatusEl.innerHTML = `<i data-lucide="${isGranted ? 'bell' : 'bell-off'}"></i>`;
      notifStatusEl.title = isGranted ? 'Notifications: ON' : 'Notifications: OFF (Click to Enable)';
      notifStatusEl.style.color = isGranted ? 'var(--tui-yellow)' : 'var(--tui-yellow-dim)';
      if (window.lucide) window.lucide.createIcons({ root: notifStatusEl });
    }

    // Update settings screen summary stats
    const statsSummary = document.getElementById('settings-vault-stats');
    if (statsSummary) {
      statsSummary.textContent = `${activeReminders.length} Active Reminders | ${passwords.length} Passwords Stored`;
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
          if (granted && window.audio) window.audio.playSuccess();
        }
      });
    }

    // Keyboard shortcut Escape closes modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const dialog = document.getElementById('alarm-dialog');
        if (dialog && (dialog.open || dialog.hasAttribute('open'))) {
          if (window.notifier) window.notifier.closeAlarmModal();
        }
      }
    });
  }

  setupSettingsActions() {
    // Sound Test
    const btnTestSound = document.getElementById('btn-test-sound');
    if (btnTestSound) {
      btnTestSound.addEventListener('click', () => {
        if (window.audio) window.audio.playAlarm();
      });
    }

    // Notification Test
    const btnTestNotif = document.getElementById('btn-test-notif');
    if (btnTestNotif) {
      btnTestNotif.addEventListener('click', async () => {
        if (window.notifier) {
          const granted = await window.notifier.requestPermission();
          if (granted) {
            new Notification('! TEST ALARM: MEMORY CORE', {
              body: 'System notifications and sound are operational!',
              icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23000" width="100" height="100"/><text y=".75em" x=".15em" font-size="70" font-family="monospace" font-weight="bold" fill="%23ffd700">!</text></svg>'
            });
            if (window.audio) window.audio.playSuccess();
          } else {
            alert('ERROR: Notifications permission not granted by browser.');
          }
        }
      });
    }

    // Export JSON Backup
    const btnExportJSON = document.getElementById('btn-export-json');
    if (btnExportJSON) {
      btnExportJSON.addEventListener('click', () => {
        const json = window.storage.exportJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `memory_core_vault_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (window.audio) window.audio.playSuccess();
      });
    }

    // Import JSON Backup
    const fileImportInput = document.getElementById('file-import-input');
    const btnImportJSON = document.getElementById('btn-import-json');

    if (btnImportJSON && fileImportInput) {
      btnImportJSON.addEventListener('click', () => {
        fileImportInput.click();
      });

      fileImportInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const result = window.storage.importJSON(event.target.result);
          if (result.success) {
            alert(`OK: Backup successfully imported!\nReminders: ${result.countReminders}\nPasswords: ${result.countPasswords}`);
            if (window.audio) window.audio.playSuccess();
          } else {
            alert(`ERROR: Failed to import: ${result.error}`);
          }
          fileImportInput.value = '';
        };
        reader.readAsText(file);
      });
    }

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

    // Purge completed reminders
    const btnPurgeCompleted = document.getElementById('btn-purge-completed');
    if (btnPurgeCompleted) {
      btnPurgeCompleted.addEventListener('click', () => {
        if (confirm('PROMPT: Purge all completed reminders?')) {
          const removed = window.storage.clearCompletedReminders();
          alert(`OK: Purged ${removed} completed reminder(s).`);
          if (window.audio) window.audio.playClick();
        }
      });
    }

    // Factory Reset
    const btnResetAll = document.getElementById('btn-reset-all');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => {
        const phrase = prompt('DANGER ZONE: Type "DELETE" to wipe all data and reset to defaults:');
        if (phrase === 'DELETE') {
          window.storage.resetAll();
          alert('OK: Memory Core reset completed.');
          location.reload();
        }
      });
    }
  }
}

// Bootstrap once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppCoordinator();
});
