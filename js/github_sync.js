/**
 * github_sync.js - Direct GitHub REST API Cloud Sync Engine
 *
 * Security Architecture:
 * - Backs up reminders, calendar tasks, and RSS feed configurations.
 * - SECURITY NOTICE: Passwords are kept strictly local-only on the device
 *   and are PURGED from all GitHub sync operations. No credentials or
 *   private keys are ever committed or sent to remote GitHub repositories.
 */

class GitHubSyncService {
  constructor() {
    this.isSyncing = false;
    this.currentSha = null;
    this.lastAutoPullAt = 0;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateStatusBadge();

    // Auto-pull on boot if GitHub is configured
    setTimeout(() => {
      const settings = window.storage ? window.storage.getSettings() : {};
      if (settings.githubToken && settings.githubRepo) {
        this.pullVault(false);
      }
    }, 600);

    // Auto-pull when the user returns to the tab (throttled to 5 minutes)
    window.addEventListener('focus', () => {
      const settings = window.storage ? window.storage.getSettings() : {};
      if (!settings.githubToken || !settings.githubRepo || this.isSyncing) return;

      const now = Date.now();
      if (now - this.lastAutoPullAt < (5 * 60 * 1000)) return;

      this.pullVault(false);
    });

    window.addEventListener('vault-updated', () => {
      const settings = window.storage ? window.storage.getSettings() : {};
      if (settings.autoSync && settings.githubToken && settings.githubRepo) {
        this.pushVault(false);
      }
    });
  }

  normalizeRepo(repoStr) {
    if (!repoStr) return '';
    let repo = repoStr.trim();
    // Remove protocol and domains
    repo = repo.replace(/^https?:\/\/github\.com\//i, '');
    repo = repo.replace(/^github\.com\//i, '');
    repo = repo.replace(/^git@github\.com:/i, '');
    // Remove trailing .git or .git/
    repo = repo.replace(/\.git\/?$/i, '');
    // Remove leading and trailing slashes
    repo = repo.replace(/^\/+|\/+$/g, '');
    return repo;
  }

  normalizePath(pathStr) {
    if (!pathStr || !pathStr.trim()) return 'memory_vault.json';
    return pathStr.trim().replace(/^\/+/, '');
  }

  normalizeBranch(branchStr) {
    return (branchStr || '').trim();
  }

  getAuthHeaders(token) {
    const cleanToken = (token || '').trim();
    const authVal = (cleanToken.startsWith('Bearer ') || cleanToken.startsWith('token '))
      ? cleanToken
      : `Bearer ${cleanToken}`;
    return {
      'Authorization': authVal,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  utf8ToBase64(str) {
    if (typeof TextEncoder !== 'undefined') {
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    }
    return window.btoa(unescape(encodeURIComponent(str)));
  }

  base64ToUtf8(b64) {
    const cleanB64 = (b64 || '').replace(/\s/g, '');
    if (typeof TextDecoder !== 'undefined') {
      const binary = window.atob(cleanB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(escape(window.atob(cleanB64)));
  }

  parseGitHubError(status, errText) {
    let parsedMsg = '';
    try {
      const json = JSON.parse(errText);
      if (json.message) parsedMsg = json.message;
    } catch (_) {
      parsedMsg = errText || '';
    }

    if (status === 401) {
      return `Authentication Failed (HTTP 401): Invalid or expired GitHub Personal Access Token. Check your token in Settings.`;
    }
    if (status === 403) {
      if (parsedMsg.toLowerCase().includes('rate limit')) {
        return `GitHub API rate limit exceeded. Please wait a moment before trying again.`;
      }
      return `Access Denied (HTTP 403): Personal Access Token does not have permission. Ensure your PAT has repository access.`;
    }
    if (status === 404) {
      return `Not Found (HTTP 404): Repository or branch not found. Verify repository name ('owner/repo') and that your token has access to it.`;
    }
    if (status === 409) {
      if (parsedMsg.toLowerCase().includes('secret') || parsedMsg.toLowerCase().includes('push-protection')) {
        return `Push Protection (HTTP 409): GitHub Secret Scanning detected a secret in the commit payload.`;
      }
      return `Git Conflict (HTTP 409): The remote repository has newer commits. Please pull before pushing. (${parsedMsg})`;
    }
    if (status === 422) {
      return `Unprocessable Entity (HTTP 422): GitHub rejected the request. (${parsedMsg})`;
    }
    return `GitHub API Error (HTTP ${status}): ${parsedMsg || 'Unknown error'}`;
  }

  async checkRepo(repo, token) {
    const cleanRepo = this.normalizeRepo(repo);
    const url = `https://api.github.com/repos/${cleanRepo}`;
    try {
      const res = await fetch(url, {
        headers: this.getAuthHeaders(token)
      });
      if (res.ok) {
        const data = await res.json();
        return {
          ok: true,
          defaultBranch: data.default_branch || 'main',
          isPrivate: !!data.private,
          fullName: data.full_name || cleanRepo,
          permissions: data.permissions || {}
        };
      }
      const errText = await res.text();
      return { ok: false, status: res.status, error: this.parseGitHubError(res.status, errText) };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  }

  async checkToken(token) {
    const url = `https://api.github.com/user`;
    try {
      const res = await fetch(url, {
        headers: this.getAuthHeaders(token)
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, username: data.login, name: data.name };
      }
      const errText = await res.text();
      return { ok: false, status: res.status, error: this.parseGitHubError(res.status, errText) };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  }

  async getFileInfo(repo, path, branch, token) {
    const cleanRepo = this.normalizeRepo(repo);
    const cleanPath = this.normalizePath(path);
    const branchParam = branch ? `?ref=${encodeURIComponent(branch)}` : '';
    const url = `https://api.github.com/repos/${cleanRepo}/contents/${cleanPath}${branchParam}`;
    try {
      const res = await fetch(url, {
        headers: this.getAuthHeaders(token)
      });
      if (res.status === 200) {
        const data = await res.json();
        return {
          ok: true,
          exists: true,
          sha: data.sha,
          content: data.content,
          downloadUrl: data.download_url
        };
      }
      if (res.status === 404) {
        return { ok: true, exists: false, sha: null };
      }
      const errText = await res.text();
      return { ok: false, status: res.status, error: this.parseGitHubError(res.status, errText) };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  }

  setupEventListeners() {
    const btnSaveSettings = document.getElementById('btn-save-gh-settings');
    const btnTest = document.getElementById('btn-gh-test');
    const btnPush = document.getElementById('btn-gh-push');
    const btnPull = document.getElementById('btn-gh-pull');
    const btnAutoSyncToggle = document.getElementById('gh-autosync-toggle');

    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        this.saveSettingsFromForm().catch(err => console.error('[GH] Save settings failed:', err));
      });
    }

    if (btnTest) {
      btnTest.addEventListener('click', () => {
        this.testConnection();
      });
    }

    if (btnPull) {
      btnPull.addEventListener('click', () => {
        this.pullVault(true);
      });
    }

    if (btnPush) {
      btnPush.addEventListener('click', () => {
        this.pushVault(true);
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
    const settings = window.storage ? window.storage.getSettings() : {};
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');
    const branchInput = document.getElementById('gh-branch-input');
    const pathInput = document.getElementById('gh-path-input');
    const autoSyncToggle = document.getElementById('gh-autosync-toggle');

    if (tokenInput && settings.githubToken) tokenInput.value = settings.githubToken;
    if (repoInput && settings.githubRepo) repoInput.value = settings.githubRepo;
    if (branchInput) branchInput.value = settings.githubBranch || '';
    if (pathInput) pathInput.value = settings.githubPath || 'memory_vault.json';
    if (autoSyncToggle) autoSyncToggle.checked = !!settings.autoSync;

    if (settings.lastSyncedAt) {
      const dateStr = new Date(settings.lastSyncedAt).toLocaleTimeString();
      this.updateSyncDetails(`Last synchronized at ${dateStr}`);
    }
  }

  async saveSettingsFromForm() {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');
    const branchInput = document.getElementById('gh-branch-input');
    const pathInput = document.getElementById('gh-path-input');

    const existing = window.storage ? window.storage.getSettings() : {};

    const githubToken = tokenInput ? tokenInput.value.trim() : '';
    let githubRepo = repoInput ? this.normalizeRepo(repoInput.value) : '';
    let githubBranch = branchInput ? this.normalizeBranch(branchInput.value) : this.normalizeBranch(existing.githubBranch);
    let githubPath = pathInput ? this.normalizePath(pathInput.value) : this.normalizePath(existing.githubPath);

    if (githubRepo && !githubRepo.includes('/')) {
      if (window.toast) window.toast.error("Invalid repository format. Use 'owner/repo' or a full GitHub URL.");
      return;
    }

    window.storage.updateSettings({
      githubToken,
      githubRepo,
      githubBranch,
      githubPath
    });

    if (repoInput) repoInput.value = githubRepo;

    this.updateStatusBadge();
    this.updateSyncDetails(`Saved: ${githubRepo || 'No repo'}. Ready to sync.`);

    // Trigger auto-sync if credentials provided
    if (githubToken && githubRepo) {
      this.pullVault(true);
    } else {
      if (window.toast) window.toast.success('Configuration saved.');
    }
  }

  updateSyncDetails(msg) {
    const detailsEl = document.getElementById('gh-sync-details');
    if (detailsEl) {
      detailsEl.textContent = `>_ ${msg}`;
    }
  }

  async testConnection() {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');
    const branchInput = document.getElementById('gh-branch-input');

    const token = tokenInput ? tokenInput.value.trim() : '';
    const repo = repoInput ? this.normalizeRepo(repoInput.value) : '';
    let branch = branchInput ? this.normalizeBranch(branchInput.value) : '';

    if (!token || !repo) {
      if (window.toast) window.toast.error('Enter both a GitHub token and repository URL first.');
      return;
    }

    this.updateStatusBadge('TESTING...');
    this.updateSyncDetails(`Testing access to ${repo}...`);

    try {
      // 1. Check user token
      const tokenResult = await this.checkToken(token);
      if (!tokenResult.ok) {
        throw new Error(tokenResult.error);
      }

      // 2. Check repository
      const repoResult = await this.checkRepo(repo, token);
      if (!repoResult.ok) {
        throw new Error(repoResult.error);
      }

      if (!branch) {
        branch = repoResult.defaultBranch || 'main';
        if (branchInput) branchInput.value = branch;
        window.storage.updateSettings({ githubBranch: branch });
      }

      // 3. Check for vault backup file
      const settings = window.storage ? window.storage.getSettings() : {};
      const vaultPath = settings.githubPath || 'memory_vault.json';
      const fileInfo = await this.getFileInfo(repo, vaultPath, branch, token);

      this.updateStatusBadge('GH CONFIGURED');
      this.updateSyncDetails(`Connected: @${tokenResult.username} -> ${repoResult.fullName} (${branch})`);

      const statusMsg = `Connected: @${tokenResult.username} -> ${repoResult.fullName} (Vault: ${fileInfo.exists ? 'Found' : 'Ready to push'})`;
      if (window.toast) {
        window.toast.success(statusMsg, 4000);
      }
    } catch (err) {
      this.updateStatusBadge('TEST FAILED');
      this.updateSyncDetails(`Error: ${err.message}`);
      if (window.toast) window.toast.error(`GitHub connection test failed: ${err.message}`);
    }
  }

  async pullVault(isUserInitiated = false) {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');

    // Auto-save form values if modified
    if (tokenInput && repoInput) {
      const inputTok = tokenInput.value.trim();
      const inputRepo = this.normalizeRepo(repoInput.value);
      if (inputTok && inputRepo) {
        window.storage.updateSettings({
          githubToken: inputTok,
          githubRepo: inputRepo
        });
      }
    }

    const settings = window.storage ? window.storage.getSettings() : {};
    if (!settings.githubToken || !settings.githubRepo) {
      if (isUserInitiated && window.toast) {
        window.toast.error('Enter your GitHub token and repository URL in Settings first.');
      }
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;
    this.lastAutoPullAt = Date.now();
    this.updateStatusBadge('PULLING...');
    this.updateSyncDetails('Connecting to GitHub repository...');

    try {
      const repo = this.normalizeRepo(settings.githubRepo);
      const token = settings.githubToken;
      const path = this.normalizePath(settings.githubPath);

      // Check repository access
      const repoCheck = await this.checkRepo(repo, token);
      if (!repoCheck.ok) {
        throw new Error(repoCheck.error || `Could not access repository ${repo}`);
      }

      let branch = (settings.githubBranch && settings.githubBranch.trim())
        ? settings.githubBranch.trim()
        : (repoCheck.defaultBranch || 'main');

      // Fetch vault file
      let fileInfo = await this.getFileInfo(repo, path, branch, token);

      // If branch 404, check repo default branch
      if (!fileInfo.ok && fileInfo.status === 404 && repoCheck.defaultBranch && repoCheck.defaultBranch !== branch) {
        branch = repoCheck.defaultBranch;
        window.storage.updateSettings({ githubBranch: branch });
        const branchInput = document.getElementById('gh-branch-input');
        if (branchInput) branchInput.value = branch;
        fileInfo = await this.getFileInfo(repo, path, branch, token);
      }

      if (!fileInfo.ok && fileInfo.error) {
        throw new Error(fileInfo.error);
      }

      if (!fileInfo.exists) {
        this.updateStatusBadge('GH CONFIGURED');
        this.updateSyncDetails(`Remote file '${path}' not found on branch '${branch}'. Ready to push.`);
        if (isUserInitiated && window.toast) {
          window.toast.info(`Connected to ${repo}. Remote '${path}' not created yet. Tap PUSH to backup.`);
        }
        return;
      }

      // Download content
      let rawJson = '';
      if (fileInfo.content) {
        rawJson = this.base64ToUtf8(fileInfo.content);
      } else if (fileInfo.downloadUrl) {
        const downloadRes = await fetch(fileInfo.downloadUrl, {
          headers: this.getAuthHeaders(token)
        });
        if (!downloadRes.ok) {
          throw new Error(`Failed to download raw vault file: HTTP ${downloadRes.status}`);
        }
        rawJson = await downloadRes.text();
      } else {
        throw new Error('Remote file content is empty or unavailable.');
      }

      this.currentSha = fileInfo.sha;

      // Import into storage (isRemoteSync = true preserves local passwords)
      const importResult = window.storage.importJSON(rawJson, true);
      if (!importResult.success) {
        throw new Error(`Failed to parse remote vault JSON: ${importResult.error}`);
      }

      window.storage.updateSettings({
        lastSyncedAt: Date.now(),
        githubBranch: branch
      });

      this.updateStatusBadge('SYNCED');
      this.updateSyncDetails(`Pulled from ${branch} at ${new Date().toLocaleTimeString()} (SHA: ${this.currentSha ? this.currentSha.slice(0, 7) : 'ok'})`);
      if (window.audio && isUserInitiated) window.audio.playSuccess();

      if (isUserInitiated && window.toast) {
        window.toast.success(
          `Vault pulled: ${importResult.countReminders} Reminders, ${importResult.countFeeds || 0} Feeds (Passwords kept local).`,
          4200
        );
      }
    } catch (err) {
      console.error('[GITHUB] Pull failed:', err);
      this.updateStatusBadge('PULL FAILED !');
      this.updateSyncDetails(`Pull failed: ${err.message}`);
      if (window.audio && isUserInitiated) window.audio.playAlarm();
      if (isUserInitiated && window.toast) {
        window.toast.error(`GitHub pull failed: ${err.message}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async pushVault(isUserInitiated = false) {
    const settings = window.storage ? window.storage.getSettings() : {};
    if (!settings.githubToken || !settings.githubRepo) {
      if (isUserInitiated && window.toast) {
        window.toast.error('Configure a GitHub token and repository in Settings first.');
      }
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusBadge('PUSHING...');
    this.updateSyncDetails('Pushing vault backup to GitHub...');

    try {
      const repo = this.normalizeRepo(settings.githubRepo);
      const path = this.normalizePath(settings.githubPath);
      let branch = this.normalizeBranch(settings.githubBranch) || 'main';
      const token = settings.githubToken;

      let fileInfo = await this.getFileInfo(repo, path, branch, token);
      if (!fileInfo.ok && fileInfo.status === 404) {
        const repoCheck = await this.checkRepo(repo, token);
        if (repoCheck.ok && repoCheck.defaultBranch && repoCheck.defaultBranch !== branch) {
          branch = repoCheck.defaultBranch;
          window.storage.updateSettings({ githubBranch: branch });
          fileInfo = await this.getFileInfo(repo, path, branch, token);
        }
      }

      if (!fileInfo.ok && fileInfo.status !== 404 && fileInfo.error) {
        throw new Error(fileInfo.error);
      }

      // SECURITY: exportSyncJSON completely strips passwords and sensitive tokens
      const contentStr = window.storage.exportSyncJSON ? window.storage.exportSyncJSON() : window.storage.exportJSON();
      const encodedContent = this.utf8ToBase64(contentStr);

      const commitDate = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const body = {
        message: `Sync MEIL vault [${commitDate}] [skip ci]`,
        content: encodedContent,
        branch: branch
      };
      if (fileInfo.exists && fileInfo.sha) {
        body.sha = fileInfo.sha;
      } else if (this.currentSha) {
        body.sha = this.currentSha;
      }

      const putUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
      let res = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          ...this.getAuthHeaders(token),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.status === 409) {
        const freshInfo = await this.getFileInfo(repo, path, branch, token);
        if (freshInfo.exists && freshInfo.sha && freshInfo.sha !== body.sha) {
          body.sha = freshInfo.sha;
          res = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              ...this.getAuthHeaders(token),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(this.parseGitHubError(res.status, errText));
      }

      const resData = await res.json();
      this.currentSha = resData.content ? resData.content.sha : null;
      window.storage.updateSettings({ lastSyncedAt: Date.now() });

      this.updateStatusBadge('SYNCED');
      this.updateSyncDetails(`Last pushed at ${new Date().toLocaleTimeString()}`);
      if (window.audio && isUserInitiated) window.audio.playSuccess();

      if (isUserInitiated && window.toast) {
        window.toast.success('Vault backup (reminders & feeds) pushed to GitHub.');
      }
    } catch (err) {
      console.error('[GITHUB] Push failed:', err);
      this.updateStatusBadge('SYNC FAILED !');
      this.updateSyncDetails(`Push failed: ${err.message}`);
      if (window.audio && isUserInitiated) window.audio.playAlarm();
      if (isUserInitiated && window.toast) {
        window.toast.error(`GitHub push failed: ${err.message}`);
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
