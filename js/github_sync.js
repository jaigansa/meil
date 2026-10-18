/**
 * github_sync.js - Direct GitHub REST API Cloud Sync Engine
 * Allows mobile browser to push and pull the memory vault directly
 * to/from a private or public GitHub repository.
 */

class GitHubSyncService {
  constructor() {
    this.isSyncing = false;
    this.currentSha = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateStatusBadge();
    window.addEventListener('vault-updated', () => {
      const settings = window.storage ? window.storage.getSettings() : {};
      if (settings.autoSync && settings.githubToken && settings.githubRepo) {
        this.pushVault();
      }
    });
  }

  utf8ToBase64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
  }

  base64ToUtf8(b64) {
    return decodeURIComponent(escape(window.atob(b64.replace(/\s/g, ''))));
  }

  setupEventListeners() {
    // Form fields in Settings (Screen 3)
    const btnSaveSettings = document.getElementById('btn-save-gh-settings');
    const btnPush = document.getElementById('btn-gh-push');
    const btnPull = document.getElementById('btn-gh-pull');
    const btnAutoSyncToggle = document.getElementById('gh-autosync-toggle');

    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        this.saveSettingsFromForm();
      });
    }

    if (btnPush) {
      btnPush.addEventListener('click', () => {
        this.pushVault(true);
      });
    }

    if (btnPull) {
      btnPull.addEventListener('click', () => {
        this.pullVault(true);
      });
    }

    if (btnAutoSyncToggle) {
      btnAutoSyncToggle.addEventListener('change', (e) => {
        window.storage.updateSettings({ autoSync: e.target.checked });
        if (window.audio) window.audio.playClick();
      });
    }

    this.populateSettingsForm();
  }

  populateSettingsForm() {
    const settings = window.storage.getSettings();
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');
    const branchInput = document.getElementById('gh-branch-input');
    const pathInput = document.getElementById('gh-path-input');
    const autoSyncToggle = document.getElementById('gh-autosync-toggle');

    if (tokenInput && settings.githubToken) tokenInput.value = settings.githubToken;
    if (repoInput && settings.githubRepo) repoInput.value = settings.githubRepo;
    if (branchInput && settings.githubBranch) branchInput.value = settings.githubBranch;
    if (pathInput && settings.githubPath) pathInput.value = settings.githubPath;
    if (autoSyncToggle) autoSyncToggle.checked = !!settings.autoSync;
  }

  saveSettingsFromForm() {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');
    const branchInput = document.getElementById('gh-branch-input');
    const pathInput = document.getElementById('gh-path-input');

    const githubToken = tokenInput ? tokenInput.value.trim() : '';
    let githubRepo = repoInput ? repoInput.value.trim() : '';
    // Normalize repo string if user pasted full URL
    githubRepo = githubRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');

    const githubBranch = branchInput ? branchInput.value.trim() || 'main' : 'main';
    const githubPath = pathInput ? pathInput.value.trim() || 'memory_vault.json' : 'memory_vault.json';

    window.storage.updateSettings({
      githubToken,
      githubRepo,
      githubBranch,
      githubPath
    });

    this.updateStatusBadge();
    if (window.audio) window.audio.playSuccess();
    alert('OK: GitHub configuration committed to local settings.');
  }

  async getFileSha(repo, path, branch, token) {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (res.status === 200) {
        const data = await res.json();
        return data.sha;
      }
      return null;
    } catch (err) {
      console.warn('[GITHUB] Could not fetch SHA:', err);
      return null;
    }
  }

  async pushVault(isUserInitiated = false) {
    const settings = window.storage.getSettings();
    if (!settings.githubToken || !settings.githubRepo) {
      if (isUserInitiated) {
        alert('ERROR: Please configure GitHub Token and Repo in Settings first.');
      }
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusBadge('PUSHING...');

    try {
      const repo = settings.githubRepo;
      const path = settings.githubPath || 'memory_vault.json';
      const branch = settings.githubBranch || 'main';
      const token = settings.githubToken;

      // 1. Get SHA of existing file if present
      const sha = await this.getFileSha(repo, path, branch, token);

      // 2. Prepare payload
      const contentStr = window.storage.exportJSON();
      const encodedContent = this.utf8ToBase64(contentStr);

      const body = {
        message: `Sync Memory Core vault [${new Date().toISOString()}] [skip ci]`,
        content: encodedContent,
        branch: branch
      };
      if (sha) {
        body.sha = sha;
      }

      const putUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
      const res = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub API error (${res.status}): ${errText}`);
      }

      const resData = await res.json();
      this.currentSha = resData.content ? resData.content.sha : null;
      window.storage.updateSettings({ lastSyncedAt: Date.now() });

      this.updateStatusBadge('SYNCED');
      if (window.audio) window.audio.playSuccess();
      if (isUserInitiated) {
        alert('OK: Vault successfully pushed to GitHub repository!');
      }
    } catch (err) {
      console.error('[GITHUB] Push failed:', err);
      this.updateStatusBadge('SYNC FAILED !');
      if (isUserInitiated) {
        alert(`ERROR: GitHub Push Failed: ${err.message}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async pullVault(isUserInitiated = false) {
    const settings = window.storage.getSettings();
    if (!settings.githubToken || !settings.githubRepo) {
      if (isUserInitiated) {
        alert('ERROR: Please configure GitHub Token and Repo in Settings first.');
      }
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusBadge('PULLING...');

    try {
      const repo = settings.githubRepo;
      const path = settings.githubPath || 'memory_vault.json';
      const branch = settings.githubBranch || 'main';
      const token = settings.githubToken;

      const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
      const res = await fetch(getUrl, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub API error (${res.status}): ${errText}`);
      }

      const fileData = await res.json();
      this.currentSha = fileData.sha;

      const rawJson = this.base64ToUtf8(fileData.content);
      const importResult = window.storage.importJSON(rawJson);

      if (!importResult.success) {
        throw new Error(`Corrupted vault data from GitHub: ${importResult.error}`);
      }

      window.storage.updateSettings({ lastSyncedAt: Date.now() });
      this.updateStatusBadge('SYNCED');
      if (window.audio) window.audio.playSuccess();
      if (isUserInitiated) {
        alert(`OK: Successfully pulled from GitHub! (${importResult.countReminders} Reminders, ${importResult.countPasswords} Passwords)`);
      }
    } catch (err) {
      console.error('[GITHUB] Pull failed:', err);
      this.updateStatusBadge('PULL FAILED !');
      if (isUserInitiated) {
        alert(`ERROR: GitHub Pull Failed: ${err.message}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  updateStatusBadge(customText) {
    const badge = document.getElementById('header-gh-status');
    const settingsStatus = document.getElementById('settings-gh-status');
    const settings = window.storage ? window.storage.getSettings() : {};

    let text = customText;
    if (!text) {
      if (!settings.githubToken || !settings.githubRepo) {
        text = 'LOCAL ONLY';
      } else if (settings.lastSyncedAt) {
        text = 'SYNCED';
      } else {
        text = 'GH CONFIGURED';
      }
    }

    if (badge) badge.textContent = `GH: ${text}`;
    if (settingsStatus) settingsStatus.textContent = `STATUS: ${text}`;
  }
}

window.githubSync = new GitHubSyncService();
