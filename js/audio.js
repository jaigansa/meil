/**
 * audio.js - Web Audio API 8-Bit Retro Synthesizer
 * Zero external audio files required. Uses Web Audio API oscillator nodes.
 */

class AudioService {
  constructor() {
    this.ctx = null;
    this.isUnlocked = false;
    this.setupUnlockListeners();
  }

  getContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setupUnlockListeners() {
    const unlock = () => {
      this.getContext();
      this.isUnlocked = true;
      ['click', 'touchstart', 'keydown'].forEach(evt => {
        document.removeEventListener(evt, unlock);
      });
    };
    ['click', 'touchstart', 'keydown'].forEach(evt => {
      document.addEventListener(evt, unlock, { once: true, passive: true });
    });
  }

  playAlarm() {
    const settings = window.storage ? window.storage.getSettings() : { soundEnabled: true };
    if (!settings.soundEnabled) return;

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Dual-tone 8-bit alarm sequence: 880Hz (A5) -> 1760Hz (A6)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square'; // Classic retro terminal 8-bit sound
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1760, now + 0.12);
      osc.frequency.setValueAtTime(880, now + 0.24);
      osc.frequency.setValueAtTime(1760, now + 0.36);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.setValueAtTime(0.22, now + 0.12);
      gain.gain.setValueAtTime(0.18, now + 0.24);
      gain.gain.setValueAtTime(0.22, now + 0.36);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.55);

      // Trigger mobile vibration if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch (err) {
      console.warn('[AUDIO] Failed to play alarm sound:', err);
    }
  }

  playClick() {
    const settings = window.storage ? window.storage.getSettings() : { soundEnabled: true };
    if (!settings.soundEnabled) return;

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (err) {
      // Ignore background click errors
    }
  }

  playSuccess() {
    const settings = window.storage ? window.storage.getSettings() : { soundEnabled: true };
    if (!settings.soundEnabled) return;

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 major triad
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.08;

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.15);
      });
    } catch (err) {
      console.warn('[AUDIO] Failed to play success sound:', err);
    }
  }
}

window.audio = new AudioService();
