/**
 * storage.js - LocalStorage Persistence Service
 * Stores Reminders, Passwords, and Settings under a single schema version.
 */

const STORAGE_KEY = 'memory_core_vault_v1';

class StorageService {
  constructor() {
    this.initDefaultData();
  }

  getVault() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.getDefaultSchema();
      const parsed = JSON.parse(raw);
      return {
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
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
      lastSyncedAt: null
    };
  }

  getDefaultSchema() {
    return {
      reminders: [],
      passwords: [],
      settings: this.getDefaultSettings()
    };
  }

  initDefaultData() {
    const raw = localStorage.getItem(STORAGE_KEY);
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
            title: 'Welcome to Memory Core! Swipe left/right to navigate.',
            details: 'Screen 1 is Calendar, Screen 2 is Passwords, Screen 3 is Settings.',
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

  // --- Backup & Restore ---
  exportJSON() {
    return JSON.stringify(this.getVault(), null, 2);
  }

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || (typeof parsed !== 'object')) {
        throw new Error('Invalid JSON format');
      }
      const vault = {
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
        settings: Object.assign(this.getDefaultSettings(), parsed.settings || {})
      };
      this.saveVault(vault);
      return { success: true, countReminders: vault.reminders.length, countPasswords: vault.passwords.length };
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
    this.initDefaultData();
  }
}

// Export singleton instance
window.storage = new StorageService();
