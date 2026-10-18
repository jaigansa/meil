/**
 * passwords.js - Password Vault Manager (pass CLI Compatible)
 * Features: Masked view, one-tap clipboard copy, 8-bit password generator,
 * instant search filter, and credential CRUD.
 */

class PasswordVault {
  constructor() {
    this.searchQuery = '';
    this.revealedIds = new Set();
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

    // Toggle Add New Credential accordion / modal
    const btnToggleAdd = document.getElementById('btn-toggle-add-pass');
    const formContainer = document.getElementById('add-pass-container');
    if (btnToggleAdd && formContainer) {
      btnToggleAdd.addEventListener('click', () => {
        const isHidden = formContainer.style.display === 'none';
        formContainer.style.display = isHidden ? 'block' : 'none';
        btnToggleAdd.textContent = isHidden ? '- HIDE FORM' : '+ NEW CREDENTIAL';
        if (window.audio) window.audio.playClick();
      });
    }

    // Password generator buttons
    const btnGenQuick = document.getElementById('btn-gen-quick');
    const btnGenInForm = document.getElementById('btn-form-gen-pass');
    const passInput = document.getElementById('pass-input-value');

    const generateAndFill = () => {
      const pwd = this.generatePassword(18);
      if (passInput) {
        passInput.value = pwd;
        passInput.type = 'text'; // Show when generated
      }
      if (window.audio) window.audio.playSuccess();
      return pwd;
    };

    if (btnGenInForm) btnGenInForm.addEventListener('click', generateAndFill);
    if (btnGenQuick) {
      btnGenQuick.addEventListener('click', () => {
        // Open form if closed and populate
        if (formContainer && formContainer.style.display === 'none') {
          formContainer.style.display = 'block';
          if (btnToggleAdd) btnToggleAdd.textContent = '- HIDE FORM';
        }
        generateAndFill();
        if (passInput) passInput.focus();
      });
    }

    // Add password form submission
    const form = document.getElementById('add-password-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAddPassword();
      });
    }
  }

  generatePassword(length = 18) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+~=-';
    let result = '';
    const cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      const values = new Uint32Array(length);
      cryptoObj.getRandomValues(values);
      for (let i = 0; i < length; i++) {
        result += chars[values[i] % chars.length];
      }
    } else {
      for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return result;
  }

  handleAddPassword() {
    const inputPath = document.getElementById('pass-input-path');
    const inputUser = document.getElementById('pass-input-user');
    const inputPass = document.getElementById('pass-input-value');
    const inputNotes = document.getElementById('pass-input-notes');

    if (!inputPath || !inputPath.value.trim()) {
      alert('ERROR: Please provide a path/service name (e.g., github.com/user or email/work).');
      return;
    }

    const path = inputPath.value.trim();
    const username = inputUser ? inputUser.value.trim() : '';
    const password = inputPass ? inputPass.value : '';
    const notes = inputNotes ? inputNotes.value.trim() : '';

    window.storage.addPassword({
      path,
      username,
      password,
      notes
    });

    // Reset form
    inputPath.value = '';
    if (inputUser) inputUser.value = '';
    if (inputPass) inputPass.value = '';
    if (inputNotes) inputNotes.value = '';

    if (window.audio) window.audio.playSuccess();
    this.renderList();
  }

  copyToClipboard(text, btnElement) {
    if (!navigator.clipboard) {
      // Fallback
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
      const orig = btnElement.textContent;
      btnElement.textContent = 'COPIED!';
      btnElement.classList.add('btn-highlight');
      setTimeout(() => {
        btnElement.textContent = orig;
        btnElement.classList.remove('btn-highlight');
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
    const countBadge = document.getElementById('pass-count-badge');
    if (!container) return;

    let items = window.storage.getPasswords();

    if (this.searchQuery) {
      items = items.filter(p =>
        (p.path && p.path.toLowerCase().includes(this.searchQuery)) ||
        (p.username && p.username.toLowerCase().includes(this.searchQuery)) ||
        (p.notes && p.notes.toLowerCase().includes(this.searchQuery))
      );
    }

    if (countBadge) {
      countBadge.textContent = `TOTAL: ${items.length}`;
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="tui-box-empty">
          ┌──────────────────────────────────────────────┐<br>
          │ NO CREDENTIALS FOUND.                        │<br>
          │ Tap + NEW CREDENTIAL to add a secret.        │<br>
          └──────────────────────────────────────────────┘
        </div>
      `;
      return;
    }

    let html = '';
    items.forEach(p => {
      const isRevealed = this.revealedIds.has(p.id);
      const displayPass = isRevealed ? this.escapeHtml(p.password) : '****************';

      html += `
        <div class="tui-card pass-card" data-id="${p.id}">
          <div class="tui-card-header">
            <span class="pass-path">> ${this.escapeHtml(p.path)}</span>
          </div>
          ${p.username ? `<div class="pass-row"><span class="tui-dim">User:</span> ${this.escapeHtml(p.username)}</div>` : ''}
          <div class="pass-row">
            <span class="tui-dim">Pass:</span>
            <span class="pass-secret ${isRevealed ? 'pass-unmasked' : ''}">${displayPass}</span>
          </div>
          ${p.notes ? `<div class="pass-notes"><span class="tui-dim">Note:</span> ${this.escapeHtml(p.notes)}</div>` : ''}
          <div class="tui-card-actions pass-card-actions">
            <button class="tui-btn btn-highlight" data-action="copy-pass">
              COPY
            </button>
            <button class="tui-btn" data-action="toggle-show">
              ${isRevealed ? 'HIDE' : 'SHOW'}
            </button>
            <button class="tui-btn btn-danger" data-action="delete-pass">
              DEL
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Attach listeners
    container.querySelectorAll('.pass-card').forEach(card => {
      const id = card.getAttribute('data-id');
      const item = window.storage.getPasswords().find(p => p.id === id);
      if (!item) return;

      const btnCopy = card.querySelector('[data-action="copy-pass"]');
      const btnShow = card.querySelector('[data-action="toggle-show"]');
      const btnDel = card.querySelector('[data-action="delete-pass"]');

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
          if (confirm(`WARNING: Delete credential "${item.path}"?`)) {
            window.storage.deletePassword(id);
            if (window.audio) window.audio.playClick();
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
