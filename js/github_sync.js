/**
 * github_sync.js - Direct GitHub REST API Cloud Sync Engine
 * Allows mobile and desktop browser to push and pull the memory vault directly
 * to/from a private or public GitHub repository (e.g. Unix pass password store).
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
    // GitHub API supports Bearer for both classic (ghp_) and fine-grained (github_pat_) tokens
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
      return `Authentication Failed (HTTP 401): Invalid or expired GitHub Personal Access Token. Please check that your token is valid.`;
    }
    if (status === 403) {
      if (parsedMsg.toLowerCase().includes('rate limit')) {
        return `GitHub API rate limit exceeded. Please wait a moment before trying again.`;
      }
      return `Access Denied (HTTP 403): Personal Access Token does not have permission. For private password repositories, ensure your PAT has 'repo' scope enabled.`;
    }
    if (status === 404) {
      return `Not Found (HTTP 404): Repository or branch not found. Verify repository name ('owner/repo') and branch. For private repositories, ensure the token has 'repo' scope.`;
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
        this.saveSettingsFromForm();
      });
    }

    if (btnTest) {
      btnTest.addEventListener('click', () => {
        this.testConnection();
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
    const settings = window.storage ? window.storage.getSettings() : {};
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');
    const branchInput = document.getElementById('gh-branch-input');
    const pathInput = document.getElementById('gh-path-input');
    const autoSyncToggle = document.getElementById('gh-autosync-toggle');

    if (tokenInput && settings.githubToken) tokenInput.value = settings.githubToken;
    if (repoInput && settings.githubRepo) repoInput.value = settings.githubRepo;
    if (branchInput) branchInput.value = settings.githubBranch || 'main';
    if (pathInput) pathInput.value = settings.githubPath || 'memory_vault.json';
    if (autoSyncToggle) autoSyncToggle.checked = !!settings.autoSync;

    if (settings.lastSyncedAt) {
      const dateStr = new Date(settings.lastSyncedAt).toLocaleTimeString();
      this.updateSyncDetails(`Last synchronized at ${dateStr}`);
    }
  }

  saveSettingsFromForm() {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');
    const branchInput = document.getElementById('gh-branch-input');
    const pathInput = document.getElementById('gh-path-input');

    const githubToken = tokenInput ? tokenInput.value.trim() : '';
    let githubRepo = repoInput ? this.normalizeRepo(repoInput.value) : '';
    let githubBranch = branchInput ? this.normalizeBranch(branchInput.value) : '';
    let githubPath = pathInput ? this.normalizePath(pathInput.value) : 'memory_vault.json';

    if (githubRepo && !githubRepo.includes('/')) {
      alert("ERROR: Invalid repository format. Please enter 'owner/repo' (e.g. jaigansa/pass-store).");
      return;
    }

    if (!githubBranch) githubBranch = 'main';

    window.storage.updateSettings({
      githubToken,
      githubRepo,
      githubBranch,
      githubPath
    });

    if (repoInput) repoInput.value = githubRepo;
    if (branchInput) branchInput.value = githubBranch;
    if (pathInput) pathInput.value = githubPath;

    this.updateStatusBadge();
    this.updateSyncDetails(`Saved: ${githubRepo || 'No repo'} (${githubBranch})`);
    if (window.audio) window.audio.playSuccess();
    alert('OK: GitHub configuration committed to local settings.');
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
    const pathInput = document.getElementById('gh-path-input');

    const token = tokenInput ? tokenInput.value.trim() : '';
    const repo = repoInput ? this.normalizeRepo(repoInput.value) : '';
    let branch = branchInput ? this.normalizeBranch(branchInput.value) : '';
    const path = pathInput ? this.normalizePath(pathInput.value) : 'memory_vault.json';

    if (!token || !repo) {
      alert('ERROR: Please enter both GitHub Personal Access Token and Repository (owner/repo) first.');
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

      // 3. Align branch if needed
      if (!branch) {
        branch = repoResult.defaultBranch || 'main';
        if (branchInput) branchInput.value = branch;
        window.storage.updateSettings({ githubBranch: branch });
      } else if (branch !== repoResult.defaultBranch) {
        const fileCheck = await this.getFileInfo(repo, path, branch, token);
        if (!fileCheck.ok && fileCheck.status === 404) {
          branch = repoResult.defaultBranch;
          if (branchInput) branchInput.value = branch;
          window.storage.updateSettings({ githubBranch: branch });
        }
      }

      // 4. Check if vault file exists in repo
      const fileInfo = await this.getFileInfo(repo, path, branch, token);
      let fileStatus = 'NOT INITIALIZED (Click PUSH TO GH to create)';
      if (fileInfo.exists) {
        fileStatus = `FOUND (SHA: ${fileInfo.sha ? fileInfo.sha.slice(0, 7) : 'present'})`;
        this.currentSha = fileInfo.sha;
      }

      this.updateStatusBadge('GH CONFIGURED');
      this.updateSyncDetails(`Connected: @${tokenResult.username} -> ${repoResult.fullName} (${branch})`);
      if (window.audio) window.audio.playSuccess();

      alert(
        `=== GITHUB REPOSITORY VERIFIED ===\n\n` +
        `User Account : @${tokenResult.username}\n` +
        `Repository   : ${repoResult.fullName} (${repoResult.isPrivate ? 'Private' : 'Public'})\n` +
        `Branch       : ${branch} (Default: ${repoResult.defaultBranch})\n` +
        `Target File  : ${path}\n` +
        `File Status  : ${fileStatus}\n\n` +
        `RESULT: GitHub API connection is fully operational!`
      );
    } catch (err) {
      this.updateStatusBadge('TEST FAILED');
      this.updateSyncDetails(`Error: ${err.message}`);
      if (window.audio) window.audio.playAlarm();
      alert(`ERROR: GitHub Connection Test Failed:\n\n${err.message}`);
    }
  }

  async pushVault(isUserInitiated = false) {
    const settings = window.storage ? window.storage.getSettings() : {};
    if (!settings.githubToken || !settings.githubRepo) {
      if (isUserInitiated) {
        alert('ERROR: Please configure GitHub Token and Repo in Settings first.');
      }
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusBadge('PUSHING...');
    this.updateSyncDetails('Pushing local memory vault to GitHub...');

    try {
      const repo = this.normalizeRepo(settings.githubRepo);
      const path = this.normalizePath(settings.githubPath);
      let branch = this.normalizeBranch(settings.githubBranch) || 'main';
      const token = settings.githubToken;

      // 1. Auto-discover or verify branch if needed
      let fileInfo = await this.getFileInfo(repo, path, branch, token);
      if (!fileInfo.ok && fileInfo.status === 404) {
        const repoCheck = await this.checkRepo(repo, token);
        if (repoCheck.ok && repoCheck.defaultBranch && repoCheck.defaultBranch !== branch) {
          branch = repoCheck.defaultBranch;
          window.storage.updateSettings({ githubBranch: branch });
          const branchInput = document.getElementById('gh-branch-input');
          if (branchInput) branchInput.value = branch;
          fileInfo = await this.getFileInfo(repo, path, branch, token);
        }
      }

      if (!fileInfo.ok && fileInfo.status !== 404 && fileInfo.error) {
        throw new Error(fileInfo.error);
      }

      // 2. Prepare payload WITHOUT githubToken to protect privacy and pass GitHub Secret Scanning
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

      // 3. Conflict resolution: if SHA was outdated (409), re-fetch latest SHA and retry once
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
      this.updateSyncDetails(`Last pushed: ${new Date().toLocaleTimeString()} (SHA: ${this.currentSha ? this.currentSha.slice(0, 7) : 'ok'})`);
      if (window.audio) window.audio.playSuccess();

      if (isUserInitiated) {
        const vault = window.storage.getVault();
        const remCount = vault.reminders ? vault.reminders.length : 0;
        const passCount = vault.passwords ? vault.passwords.length : 0;
        alert(
          `OK: Vault successfully pushed to GitHub repository!\n\n` +
          `Repository : ${repo}\n` +
          `Branch     : ${branch}\n` +
          `File Path  : ${path}\n` +
          `Synced     : ${remCount} Reminders, ${passCount} Passwords`
        );
      }
    } catch (err) {
      console.error('[GITHUB] Push failed:', err);
      this.updateStatusBadge('SYNC FAILED !');
      this.updateSyncDetails(`Push failed: ${err.message}`);
      if (window.audio && isUserInitiated) window.audio.playAlarm();
      if (isUserInitiated) {
        alert(`ERROR: GitHub Push Failed:\n\n${err.message}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async pullVault(isUserInitiated = false) {
    const settings = window.storage ? window.storage.getSettings() : {};
    if (!settings.githubToken || !settings.githubRepo) {
      if (isUserInitiated) {
        alert('ERROR: Please configure GitHub Token and Repo in Settings first.');
      }
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusBadge('PULLING...');
    this.updateSyncDetails('Pulling latest vault from GitHub...');

    try {
      const repo = this.normalizeRepo(settings.githubRepo);
      const path = this.normalizePath(settings.githubPath);
      let branch = this.normalizeBranch(settings.githubBranch) || 'main';
      const token = settings.githubToken;

      let fileInfo = await this.getFileInfo(repo, path, branch, token);

      // If branch 404, check repo default branch
      if (!fileInfo.ok && fileInfo.status === 404) {
        const repoCheck = await this.checkRepo(repo, token);
        if (repoCheck.ok && repoCheck.defaultBranch && repoCheck.defaultBranch !== branch) {
          branch = repoCheck.defaultBranch;
          window.storage.updateSettings({ githubBranch: branch });
          const branchInput = document.getElementById('gh-branch-input');
          if (branchInput) branchInput.value = branch;
          fileInfo = await this.getFileInfo(repo, path, branch, token);
        }
      }

      if (!fileInfo.ok && fileInfo.error) {
        throw new Error(fileInfo.error);
      }

      // If file does not exist on remote
      if (!fileInfo.exists) {
        const repoCheck = await this.checkRepo(repo, token);
        if (repoCheck.ok) {
          const msg = `Repository '${repo}' (branch '${branch}') is connected, but file '${path}' does not exist on GitHub yet.\n\nTo start syncing, click 'PUSH TO GH' to upload your local vault.`;
          this.updateStatusBadge('GH CONFIGURED');
          this.updateSyncDetails(`Remote file not found on branch '${branch}'. Ready to push.`);
          if (isUserInitiated) alert(`NOTICE: ${msg}`);
          return;
        } else {
          throw new Error(repoCheck.error || `Repository '${repo}' not found.`);
        }
      }

      // Retrieve and decode content
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
      const importResult = window.storage.importJSON(rawJson);

      if (!importResult.success) {
        throw new Error(`Corrupted vault data from GitHub: ${importResult.error}`);
      }

      window.storage.updateSettings({ lastSyncedAt: Date.now() });
      this.updateStatusBadge('SYNCED');
      this.updateSyncDetails(`Last pulled: ${new Date().toLocaleTimeString()} (SHA: ${this.currentSha ? this.currentSha.slice(0, 7) : 'ok'})`);
      if (window.audio) window.audio.playSuccess();

      if (isUserInitiated) {
        alert(
          `OK: Successfully pulled vault from GitHub!\n\n` +
          `Reminders : ${importResult.countReminders}\n` +
          `Passwords : ${importResult.countPasswords}\n` +
          `Feeds     : ${importResult.countFeeds || 0}`
        );
      }
    } catch (err) {
      console.error('[GITHUB] Pull failed:', err);
      this.updateStatusBadge('PULL FAILED !');
      this.updateSyncDetails(`Pull failed: ${err.message}`);
      if (window.audio && isUserInitiated) window.audio.playAlarm();
      if (isUserInitiated) {
        alert(`ERROR: GitHub Pull Failed:\n\n${err.message}`);
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
