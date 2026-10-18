/**
 * notifier.js - Reminder Scheduler & Notification Engine
 * Polls active reminders, fires Web Notifications & Web Audio alarms,
 * handles snooze math, and processes recurring schedules.
 */

class NotifierService {
  constructor() {
    this.pollInterval = null;
    this.activeAlarmItem = null;
    this.init();
  }

  init() {
    this.startScheduler();
    this.setupModalControls();
  }

  hasNotificationPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      alert('ERROR: Web Notifications not supported by your browser.');
      return false;
    }
    try {
      const res = await Notification.requestPermission();
      window.dispatchEvent(new CustomEvent('notif-perm-changed', { detail: res }));
      return res === 'granted';
    } catch (err) {
      console.warn('[NOTIF] Request failed:', err);
      return false;
    }
  }

  startScheduler() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    // Poll every 4 seconds
    this.pollInterval = setInterval(() => {
      this.checkDueReminders();
    }, 4000);
    // Initial check on boot
    setTimeout(() => this.checkDueReminders(), 500);
  }

  checkDueReminders() {
    if (!window.storage) return;
    const reminders = window.storage.getReminders();
    const now = Date.now();

    for (const item of reminders) {
      if (item.isCompleted) continue;

      const targetTime = item.snoozedUntil || item.dueAt;
      if (!targetTime) continue;

      // If the reminder is due (or overdue by <= 48 hours) and hasn't been triggered yet
      if (targetTime <= now && !item.isTriggered) {
        this.triggerAlarm(item);
        break; // Trigger one alarm at a time to prevent modal stacking
      }
    }
  }

  triggerAlarm(item) {
    this.activeAlarmItem = item;

    // Mark as triggered in storage so it doesn't repeatedly fire every tick
    window.storage.updateReminder(item.id, { isTriggered: true });

    // 1. Play retro 8-bit sound
    if (window.audio) {
      window.audio.playAlarm();
    }

    // 2. Dispatch system / desktop notification
    if (this.hasNotificationPermission()) {
      try {
        new Notification(`! REMINDER DUE: ${item.title}`, {
          body: `${item.details || 'Scheduled for ' + item.time}\nSwipe into Memory Core to manage.`,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23000" width="100" height="100"/><text y=".75em" x=".15em" font-size="70" font-family="monospace" font-weight="bold" fill="%23ffd700">!</text></svg>',
          tag: item.id
        });
      } catch (err) {
        console.warn('[NOTIF] Failed to show system notification:', err);
      }
    }

    // 3. Show TUI in-page ASCII modal
    this.showAlarmModal(item);
  }

  showAlarmModal(item) {
    const dialog = document.getElementById('alarm-dialog');
    if (!dialog) return;

    const titleEl = document.getElementById('alarm-item-title');
    const detailsEl = document.getElementById('alarm-item-details');
    const timeEl = document.getElementById('alarm-item-time');

    if (titleEl) titleEl.textContent = item.title;
    if (detailsEl) {
      detailsEl.textContent = item.details ? `DETAILS: ${item.details}` : '';
      detailsEl.style.display = item.details ? 'block' : 'none';
    }
    if (timeEl) timeEl.textContent = `SCHEDULED: ${item.date} @ ${item.time} ${item.repeat !== 'NONE' ? 'RPT: ' + item.repeat : ''}`;

    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
      } catch (e) {
        dialog.setAttribute('open', 'true');
      }
    } else {
      dialog.setAttribute('open', 'true');
    }
  }

  closeAlarmModal() {
    const dialog = document.getElementById('alarm-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    this.activeAlarmItem = null;
  }

  setupModalControls() {
    const dialog = document.getElementById('alarm-dialog');
    if (!dialog) return;

    // Complete button
    const btnDone = document.getElementById('btn-alarm-done');
    if (btnDone) {
      btnDone.addEventListener('click', () => {
        if (!this.activeAlarmItem) return;
        this.completeAlarm(this.activeAlarmItem);
        this.closeAlarmModal();
        if (window.audio) window.audio.playSuccess();
      });
    }

    // Snooze buttons
    document.querySelectorAll('[data-snooze]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!this.activeAlarmItem) return;
        const type = e.target.getAttribute('data-snooze');
        this.snoozeAlarm(this.activeAlarmItem, type);
        this.closeAlarmModal();
        if (window.audio) window.audio.playClick();
      });
    });

    // Dismiss button
    const btnDismiss = document.getElementById('btn-alarm-dismiss');
    if (btnDismiss) {
      btnDismiss.addEventListener('click', () => {
        this.closeAlarmModal();
      });
    }
  }

  completeAlarm(item) {
    if (item.repeat && item.repeat !== 'NONE') {
      // Advance to next recurring period
      this.advanceRecurringReminder(item);
    } else {
      window.storage.updateReminder(item.id, {
        isCompleted: true,
        isTriggered: true,
        snoozedUntil: null
      });
    }
  }

  advanceRecurringReminder(item) {
    const currentDate = new Date(`${item.date}T${item.time || '09:00'}:00`);
    let nextDate = new Date(currentDate);

    if (item.repeat === 'DAILY') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (item.repeat === 'WEEKLY') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (item.repeat === 'MONTHLY') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDate.getDate()).padStart(2, '0');
    const newDateStr = `${yyyy}-${mm}-${dd}`;

    window.storage.updateReminder(item.id, {
      date: newDateStr,
      dueAt: nextDate.getTime(),
      isTriggered: false,
      snoozedUntil: null,
      isCompleted: false
    });
  }

  snoozeAlarm(item, type) {
    const now = Date.now();
    let snoozedUntil = now;

    switch (type) {
      case '5m':
        snoozedUntil = now + (5 * 60 * 1000);
        break;
      case '15m':
        snoozedUntil = now + (15 * 60 * 1000);
        break;
      case '1h':
        snoozedUntil = now + (60 * 60 * 1000);
        break;
      case 'tomorrow': {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0); // Tomorrow at 09:00 AM
        snoozedUntil = tomorrow.getTime();
        break;
      }
      default:
        snoozedUntil = now + (10 * 60 * 1000);
    }

    window.storage.updateReminder(item.id, {
      snoozedUntil: snoozedUntil,
      isTriggered: false
    });
  }
}

window.notifier = new NotifierService();
