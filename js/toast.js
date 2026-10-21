/**
 * toast.js - Non-blocking TUI Toast Notification Host
 * Replaces native alert() dialogs which are jarring and block the UI on mobile.
 * Renders a stack of terminal-styled snackbars anchored above the safe area.
 */

class ToastHost {
  constructor() {
    this.host = null;
    this.maxVisible = 3;
    this.init();
  }

  init() {
    const build = () => {
      if (this.host || document.getElementById('toast-host')) return;
      this.host = document.createElement('div');
      this.host.id = 'toast-host';
      this.host.setAttribute('role', 'status');
      this.host.setAttribute('aria-live', 'polite');
      document.body.appendChild(this.host);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }
  }

  getHost() {
    if (!this.host) {
      this.host = document.getElementById('toast-host');
    }
    if (this.host) {
      // showModal() dialogs render in the browser top layer, which always
      // paints above body content regardless of z-index. Re-parent the host
      // into the open dialog so toasts stay visible above modals. A fixed
      // toast host inside a dialog still anchors to the viewport because
      // dialogs don't create a containing block (no transform on them).
      const openDialog = document.querySelector('dialog[open]');
      const parent = openDialog || document.body;
      if (this.host.parentElement !== parent) {
        parent.appendChild(this.host);
      }
    }
    return this.host;
  }

  show(message, type = 'info', duration = 2800) {
    const host = this.getHost();
    if (!host) return;

    // Coalesce duplicate stacked messages (e.g. repeated sync errors)
    Array.from(host.children).forEach(existing => {
      if (existing.textContent === message) existing.remove();
    });

    const toast = document.createElement('div');
    toast.className = `tui-toast toast-${type}`;

    const prefix = type === 'error' ? '! ' : (type === 'success' ? 'OK ' : '>_ ');
    toast.innerHTML = `<span class="toast-prefix">${prefix}</span><span class="toast-msg"></span>`;
    toast.querySelector('.toast-msg').textContent = message;

    host.appendChild(toast);

    // Cap the visible stack, drop the oldest
    while (host.children.length > this.maxVisible) {
      host.removeChild(host.firstElementChild);
    }

    // Enter transition
    requestAnimationFrame(() => toast.classList.add('toast-in'));

    const dismiss = () => {
      toast.classList.remove('toast-in');
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 220);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);

    if (window.audio) {
      if (type === 'error') window.audio.playAlarm();
      else if (type === 'success') window.audio.playSuccess();
      else window.audio.playClick();
    }

    return dismiss;
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    // Errors linger longer so the user can read them
    return this.show(message, 'error', duration || 5000);
  }
}

window.toast = new ToastHost();
