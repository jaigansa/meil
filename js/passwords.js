/**
 * passwords.js - Password Vault Manager (Local Browser Storage)
 *
 * Security Architecture:
 * - Credentials are stored strictly on-device in local browser storage.
 * - All remote GitHub pass repository syncing and cloud transmission
 *   have been completely purged to eliminate credential exposure risks.
 * - Masked view, 1-tap clipboard copy, inline show/hide reveal,
 *   cryptographically secure password generator, and instant search filter.
 */

class PasswordVault {
  constructor() {
    this.searchQuery = '';
    this.revealedIds = new Set();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupNewPassModalListeners();
    this.render();
    window.addEventListener('vault-updated', () => {
      this.render();
    });
  }

  setupEventListeners() {
    const searchInput = document.getElementById('pass-search-input');
    const searchClear = document.getElementById('pass-search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderList();
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        this.searchQuery = '';
        this.renderList();
        if (window.audio) window.audio.playClick();
      });
    }
  }

  setupNewPassModalListeners() {
    const form = document.getElementById('new-pass-form');
    const btnOpen = document.getElementById('btn-open-new-pass');
    const btnClose = document.getElementById('btn-close-new-pass');
    const btnCancel = document.getElementById('btn-cancel-new-pass');
    const btnGen = document.getElementById('btn-new-pass-gen');
    const btnEye = document.getElementById('btn-new-pass-eye');
    const inputVal = document.getElementById('new-pass-value');
    const statusMsg = document.getElementById('new-pass-status');
    const submitBtn = document.getElementById('btn-submit-new-pass');

    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        this.openNewPassModal();
      });
    }

    if (btnGen && inputVal) {
      btnGen.addEventListener('click', () => {
        inputVal.value = this.generatePassword(18);
        inputVal.type = 'text';
        if (btnEye) {
          btnEye.innerHTML = '<i data-lucide="eye-off"></i>';
          if (window.lucide) window.lucide.createIcons({ root: btnEye });
        }
        if (window.audio) window.audio.playSuccess();
      });
    }

    if (btnEye && inputVal) {
      btnEye.addEventListener('click', () => {
        const isPassword = inputVal.type === 'password';
        inputVal.type = isPassword ? 'text' : 'password';
        btnEye.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}"></i>`;
        if (window.lucide) window.lucide.createIcons({ root: btnEye });
      });
    }

    const closeHandler = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.closeNewPassModal();
    };

    if (btnClose) btnClose.addEventListener('click', closeHandler);
    if (btnCancel) btnCancel.addEventListener('click', closeHandler);

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputPath = document.getElementById('new-pass-path');
        const inputUser = document.getElementById('new-pass-user');
        const inputNotes = document.getElementById('new-pass-notes');

        const path = inputPath ? inputPath.value.trim() : '';
        const password = inputVal ? inputVal.value : '';
        const username = inputUser ? inputUser.value.trim() : '';
        const notes = inputNotes ? inputNotes.value.trim() : '';

        if (!path || !password) {
          if (window.toast) window.toast.error('Please provide both Path and Password.');
          return;
        }

        try {
          window.storage.addPassword({
            path,
            password,
            username,
            notes
          });

          this.closeNewPassModal();
          this.renderList();

          if (window.toast) window.toast.success(`Saved "${path}" to local vault.`);
          if (window.audio) window.audio.playSuccess();
        } catch (err) {
          console.error('[PASS] Add failed:', err);
          if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.color = 'var(--tui-danger, #ff3b00)';
            statusMsg.textContent = `! ERROR: ${err.message}`;
          }
          if (window.audio) window.audio.playAlarm();
        }
      });
    }
  }

  openNewPassModal() {
    const dialog = document.getElementById('new-pass-dialog');
    const form = document.getElementById('new-pass-form');
    const inputPath = document.getElementById('new-pass-path');
    const inputVal = document.getElementById('new-pass-value');
    const statusMsg = document.getElementById('new-pass-status');

    if (form) form.reset();
    if (inputVal) inputVal.type = 'password';
    if (statusMsg) {
      statusMsg.style.display = 'none';
      statusMsg.textContent = '';
    }

    if (dialog) {
      if (typeof dialog.showModal === 'function') {
        try {
          if (!dialog.open) dialog.showModal();
        } catch (_) {
          dialog.setAttribute('open', '');
        }
      } else {
        dialog.setAttribute('open', '');
      }
    }

    setTimeout(() => {
      if (inputPath) inputPath.focus();
    }, 100);

    if (window.lucide) window.lucide.createIcons({ root: dialog });
    if (window.audio) window.audio.playClick();
  }

  closeNewPassModal() {
    const dialog = document.getElementById('new-pass-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      try {
        if (dialog.open) dialog.close();
      } catch (_) {
        dialog.removeAttribute('open');
      }
    } else {
      dialog.removeAttribute('open');
    }
    if (window.audio) window.audio.playClick();
  }

  generatePassword(length = 18) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+~=-';
    let result = '';
    const cryptoObj = window.crypto || window.msCrypto;
    const values = new Uint32Array(length);
    cryptoObj.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += chars[values[i] % chars.length];
    }
    return result;
  }

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
      const origHtml = btnElement.innerHTML;
      btnElement.innerHTML = '<i data-lucide="check"></i> COPIED';
      btnElement.classList.add('btn-highlight');
      if (window.lucide) window.lucide.createIcons({ root: btnElement });
      setTimeout(() => {
        btnElement.innerHTML = origHtml;
        btnElement.classList.remove('btn-highlight');
        if (window.lucide) window.lucide.createIcons({ root: btnElement });
      }, 1500);
    }

    if (window.audio) window.audio.playClick();
  }

  toggleReveal(id) {
    if (this.revealedIds.has(id)) {
      this.revealedIds.delete(id);
    } else {
      this.revealedIds.add(id);
    }
    this.renderList();
    if (window.audio) window.audio.playClick();
  }

  render() {
    this.renderList();
  }

  renderList() {
    const container = document.getElementById('passwords-list');
    if (!container) return;

    let items = window.storage.getPasswords();

    if (this.searchQuery) {
      items = items.filter(p =>
        (p.path && p.path.toLowerCase().includes(this.searchQuery)) ||
        (p.username && p.username.toLowerCase().includes(this.searchQuery)) ||
        (p.notes && p.notes.toLowerCase().includes(this.searchQuery))
      );
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="tui-box-empty">
          <div class="tui-empty-frame">
            <div class="tui-empty-title">${this.searchQuery ? 'NO MATCHING PASSWORDS' : 'NO PASSWORDS STORED'}</div>
            <div class="tui-empty-hint">${this.searchQuery ? 'Adjust the search filter above.' : 'Tap + NEW to add a credential to your local vault.'}</div>
          </div>
        </div>
      `;
      return;
    }

    let html = '';
    items.forEach(p => {
      const isRevealed = this.revealedIds.has(p.id);

      html += `
        <div class="pass-compact-row" data-id="${p.id}">
          <div class="pass-compact-main">
            <div class="pass-compact-header">
              <span class="pass-path">> ${this.escapeHtml(p.path)}</span>
              ${p.username ? `<span class="pass-user-tag">@${this.escapeHtml(p.username)}</span>` : ''}
            </div>
            ${isRevealed ? `<div class="pass-revealed-val">${this.escapeHtml(p.password)}</div>` : ''}
            ${p.notes ? `<div class="pass-notes-val">${this.escapeHtml(p.notes)}</div>` : ''}
          </div>
          <div class="pass-compact-actions">
            <button class="tui-btn btn-highlight btn-sm" data-action="copy-pass" title="Copy Password">
              <i data-lucide="copy"></i> COPY
            </button>
            <button class="tui-btn btn-icon btn-sm" data-action="toggle-show" title="${isRevealed ? 'Hide Password' : 'Show Password'}">
              <i data-lucide="${isRevealed ? 'eye-off' : 'eye'}"></i>
            </button>
            <button class="tui-btn btn-icon btn-sm btn-dim" data-action="delete-pass" title="Delete Credential">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons({ root: container });

    // Attach listeners
    container.querySelectorAll('.pass-compact-row').forEach(row => {
      const id = row.getAttribute('data-id');
      const item = window.storage.getPasswords().find(p => p.id === id);
      if (!item) return;

      const btnCopy = row.querySelector('[data-action="copy-pass"]');
      const btnShow = row.querySelector('[data-action="toggle-show"]');
      const btnDel = row.querySelector('[data-action="delete-pass"]');

      if (btnCopy) {
        btnCopy.addEventListener('click', (e) => {
          this.copyToClipboard(item.password, e.currentTarget);
        });
      }
      if (btnShow) {
        btnShow.addEventListener('click', () => {
          this.toggleReveal(id);
        });
      }
      if (btnDel) {
        btnDel.addEventListener('click', () => {
          if (confirm(`Remove "${item.path}" from local vault?`)) {
            window.storage.deletePassword(id);
            if (window.toast) window.toast.info(`Removed "${item.path}".`);
            if (window.audio) window.audio.playClick();
            this.renderList();
          }
        });
      }
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

window.passwords = new PasswordVault();
