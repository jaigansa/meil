/**
 * swipe.js - 3-Screen Pure Swipe Navigation Controller
 * Handles silky-smooth CSS scroll-snap carousel, updates the persistent top header
 * with the current screen title and dots [● ○ ○], and handles ArrowLeft/ArrowRight,
 * orientation changes, and the touch tap arrows.
 */

class SwipeController {
  constructor() {
    this.track = document.getElementById('swipe-track');
    this.screens = document.querySelectorAll('.tui-screen');
    this.screenTitles = [
      'CALENDAR',
      'PASSWORDS',
      'RSS FEEDS'
    ];
    this.currentIndex = 0;
    this.lastTrackWidth = 0;
    this.init();
  }

  init() {
    if (!this.track) return;
    this.lastTrackWidth = this.track.clientWidth;
    this.buildScreenDots();
    this.setupScrollListener();
    this.setupKeyboardNavigation();
    this.setupHeaderTapArrows();
    this.setupOrientationHandler();
    this.updateHeader(0);
  }

  buildScreenDots() {
    const dotsEl = document.getElementById('swipe-dots');
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    this.screenTitles.forEach((title, idx) => {
      const dot = document.createElement('button');
      dot.className = 'swipe-dot';
      dot.setAttribute('data-screen-index', String(idx));
      dot.setAttribute('aria-label', `Go to ${title} screen`);
      dot.addEventListener('click', () => this.goToScreen(idx));
      dotsEl.appendChild(dot);
    });
  }

  setupScrollListener() {
    let scrollTimeout = null;

    const onScroll = () => {
      if (!this.track) return;
      const width = this.track.clientWidth;
      if (width === 0) return;

      const idx = Math.round(this.track.scrollLeft / width);
      if (idx !== this.currentIndex && idx >= 0 && idx < this.screenTitles.length) {
        this.currentIndex = idx;
        this.updateHeader(idx);
        if (window.audio) window.audio.playClick();
        window.dispatchEvent(new CustomEvent('screen-changed', {
          detail: { screenIndex: idx, screenTitle: this.screenTitles[idx] }
        }));
      }
    };

    this.track.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(onScroll, 40);
    }, { passive: true });

    // Modern browsers fire scrollend when physical swipe finishes snapping
    if ('onscrollend' in window) {
      this.track.addEventListener('scrollend', onScroll, { passive: true });
    }
  }

  setupOrientationHandler() {
    let resizeTimer = null;

    window.addEventListener('resize', () => {
      if (!this.track) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const width = this.track.clientWidth;
        // Only re-align when the width actually changed (orientation change).
        // Height-only changes come from the mobile URL bar / virtual keyboard
        // and must not yank the user back to a screen mid-scroll.
        if (width === 0 || width === this.lastTrackWidth) return;
        this.lastTrackWidth = width;
        this.goToScreen(this.currentIndex, 'auto');
      }, 150);
    });
  }

  setupKeyboardNavigation() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing inside an input or textarea
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'ArrowRight' || e.key === 'l') {
        this.nextScreen();
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        this.prevScreen();
      }
    });
  }

  setupHeaderTapArrows() {
    const leftArrow = document.getElementById('swipe-arrow-left');
    const rightArrow = document.getElementById('swipe-arrow-right');

    if (leftArrow) {
      leftArrow.addEventListener('click', () => this.prevScreen());
    }
    if (rightArrow) {
      rightArrow.addEventListener('click', () => this.nextScreen());
    }
  }

  /**
   * Scrolls to the actual screen element offset instead of index * clientWidth,
   * which stays correct with scrollbars, safe-area padding and fractional widths.
   */
  goToScreen(index, behavior = 'smooth') {
    if (!this.track) return;
    const clamped = Math.max(0, Math.min(index, this.screenTitles.length - 1));
    const target = this.screens[clamped];
    if (!target) return;

    this.track.scrollTo({
      left: target.offsetLeft - this.track.offsetLeft,
      behavior
    });
    this.currentIndex = clamped;
    this.updateHeader(clamped);
    window.dispatchEvent(new CustomEvent('screen-changed', {
      detail: { screenIndex: clamped, screenTitle: this.screenTitles[clamped] }
    }));
  }

  nextScreen() {
    if (this.currentIndex < this.screenTitles.length - 1) {
      this.goToScreen(this.currentIndex + 1);
      if (window.audio) window.audio.playClick();
    }
  }

  prevScreen() {
    if (this.currentIndex > 0) {
      this.goToScreen(this.currentIndex - 1);
      if (window.audio) window.audio.playClick();
    }
  }

  updateHeader(index) {
    const titleEl = document.getElementById('swipe-screen-title');
    if (titleEl && this.screenTitles[index]) {
      titleEl.textContent = `${this.screenTitles[index]}`;
    }

    const leftArrow = document.getElementById('swipe-arrow-left');
    const rightArrow = document.getElementById('swipe-arrow-right');
    if (leftArrow) {
      leftArrow.disabled = (index === 0);
    }
    if (rightArrow) {
      rightArrow.disabled = (index === this.screenTitles.length - 1);
    }

    const dotsEl = document.getElementById('swipe-dots');
    if (dotsEl) {
      Array.from(dotsEl.children).forEach((dot, idx) => {
        const active = idx === index;
        dot.classList.toggle('active', active);
        dot.setAttribute('aria-current', active ? 'page' : 'false');
      });
    }
  }
}

window.swipe = new SwipeController();
