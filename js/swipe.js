/**
 * swipe.js - 3-Screen Pure Swipe Navigation Controller
 * Handles silky-smooth CSS scroll-snap carousel, updates the persistent top header
 * with current screen index [ 1/3 ], [ 2/3 ], [ 3/3 ], screen dots [● ○ ○],
 * and handles ArrowLeft/ArrowRight, orientation change, and touch tap arrows.
 */

class SwipeController {
  constructor() {
    this.track = document.getElementById('swipe-track');
    this.screens = document.querySelectorAll('.tui-screen');
    this.screenTitles = [
      '1/3 : CALENDAR',
      '2/3 : PASSWORDS',
      '3/3 : SETTINGS'
    ];
    this.currentIndex = 0;
    this.init();
  }

  init() {
    if (!this.track) return;
    this.setupScrollListener();
    this.setupKeyboardNavigation();
    this.setupHeaderTapArrows();
    this.setupOrientationHandler();
    this.updateHeader(0);
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
    window.addEventListener('resize', () => {
      if (!this.track) return;
      const width = this.track.clientWidth;
      this.track.scrollTo({
        left: this.currentIndex * width,
        behavior: 'auto'
      });
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

  goToScreen(index) {
    if (!this.track) return;
    const clamped = Math.max(0, Math.min(index, this.screenTitles.length - 1));
    const width = this.track.clientWidth;
    this.track.scrollTo({
      left: clamped * width,
      behavior: 'smooth'
    });
    this.currentIndex = clamped;
    this.updateHeader(clamped);
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
      titleEl.textContent = `[ ${this.screenTitles[index]} ]`;
    }

    const leftArrow = document.getElementById('swipe-arrow-left');
    const rightArrow = document.getElementById('swipe-arrow-right');
    if (leftArrow) {
      leftArrow.disabled = (index === 0);
    }
    if (rightArrow) {
      rightArrow.disabled = (index === this.screenTitles.length - 1);
    }

    // Update screen dot indicators
    const dotsContainer = document.getElementById('swipe-dots');
    if (dotsContainer) {
      const dots = dotsContainer.querySelectorAll('.dot');
      dots.forEach((dot, idx) => {
        if (idx === index) {
          dot.textContent = '●';
          dot.classList.add('active');
        } else {
          dot.textContent = '○';
          dot.classList.remove('active');
        }
      });
    }
  }
}

window.swipe = new SwipeController();
