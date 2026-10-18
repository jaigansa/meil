/**
 * calendar.js - Single Month ASCII Calendar & Daily Reminder Manager
 * Renders an interactive TUI calendar for Screen 1 with day selection,
 * reminder markers (*), and a quick reminder creator.
 */

class CalendarView {
  constructor() {
    this.currentDate = new Date();
    this.selectedDateStr = this.formatDate(this.currentDate);
    this.months = [
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];
    this.daysOfWeek = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.render();
    window.addEventListener('vault-updated', () => {
      this.render();
    });
  }

  formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.render();
    if (window.audio) window.audio.playClick();
  }

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.render();
    if (window.audio) window.audio.playClick();
  }

  goToToday() {
    this.currentDate = new Date();
    this.selectedDateStr = this.formatDate(this.currentDate);
    this.render();
    if (window.audio) window.audio.playClick();
  }

  selectDate(dateStr) {
    this.selectedDateStr = dateStr;
    this.render();
    if (window.audio) window.audio.playClick();
  }

  setupEventListeners() {
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    const todayBtn = document.getElementById('cal-today');

    if (prevBtn) prevBtn.addEventListener('click', () => this.prevMonth());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextMonth());
    if (todayBtn) todayBtn.addEventListener('click', () => this.goToToday());

    // Quick add reminder form
    const form = document.getElementById('quick-reminder-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleQuickAdd();
      });
    }
  }

  handleQuickAdd() {
    const inputTitle = document.getElementById('reminder-title-input');
    const inputTime = document.getElementById('reminder-time-input');
    const selectRepeat = document.getElementById('reminder-repeat-select');
    const selectPriority = document.querySelector('input[name="reminder-priority"]:checked');

    if (!inputTitle || !inputTitle.value.trim()) return;

    const title = inputTitle.value.trim();
    const time = inputTime ? inputTime.value || '09:00' : '09:00';
    const repeat = selectRepeat ? selectRepeat.value : 'NONE';
    const priority = selectPriority ? selectPriority.value : 'NORMAL';

    window.storage.addReminder({
      title,
      date: this.selectedDateStr,
      time,
      repeat,
      priority
    });

    inputTitle.value = '';
    if (window.audio) window.audio.playSuccess();
    this.render();
  }

  render() {
    this.renderCalendarGrid();
    this.renderRemindersForSelectedDate();
  }

  renderCalendarGrid() {
    const titleEl = document.getElementById('cal-month-title');
    const gridEl = document.getElementById('cal-grid');
    if (!gridEl) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    if (titleEl) {
      titleEl.textContent = `${this.months[month]} ${year}`;
    }

    // Days in current month
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayStr = this.formatDate(new Date());

    // Fetch all reminders to badge days with reminders
    const allReminders = window.storage.getReminders();
    const reminderCounts = {};
    allReminders.forEach(r => {
      if (!r.isCompleted) {
        reminderCounts[r.date] = (reminderCounts[r.date] || 0) + 1;
      }
    });

    let html = '';

    // Day of week headers
    this.daysOfWeek.forEach(day => {
      html += `<div class="cal-cell cal-header">${day}</div>`;
    });

    // Empty leading cells
    for (let i = 0; i < firstDayIndex; i++) {
      html += `<div class="cal-cell cal-empty"></div>`;
    }

    // Days of month
    for (let d = 1; d <= totalDays; d++) {
      const ddStr = String(d).padStart(2, '0');
      const mmStr = String(month + 1).padStart(2, '0');
      const dateStr = `${year}-${mmStr}-${ddStr}`;

      const isToday = (dateStr === todayStr);
      const isSelected = (dateStr === this.selectedDateStr);
      const remCount = reminderCounts[dateStr] || 0;

      let cellClasses = ['cal-cell', 'cal-day'];
      if (isToday) cellClasses.push('is-today');
      if (isSelected) cellClasses.push('is-selected');
      if (remCount > 0) cellClasses.push('has-reminder');

      const marker = remCount > 0 ? `<span class="rem-dot" title="${remCount} reminder(s)">*</span>` : '';

      html += `
        <div class="${cellClasses.join(' ')}" data-date="${dateStr}">
          <span class="day-num">${ddStr}</span>${marker}
        </div>
      `;
    }

    gridEl.innerHTML = html;

    // Attach click handlers to day cells
    gridEl.querySelectorAll('.cal-day').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.getAttribute('data-date');
        this.selectDate(dateStr);
      });
    });
  }

  renderRemindersForSelectedDate() {
    const container = document.getElementById('selected-day-reminders');
    const headerEl = document.getElementById('selected-date-header');
    const quickAddTargetDate = document.getElementById('quick-add-target-date');

    if (!container) return;

    const reminders = window.storage.getRemindersForDate(this.selectedDateStr);

    if (headerEl) {
      headerEl.textContent = `[ ${this.selectedDateStr} ] :: ${reminders.length} REMINDER${reminders.length === 1 ? '' : 'S'}`;
    }
    if (quickAddTargetDate) {
      quickAddTargetDate.textContent = this.selectedDateStr;
    }

    if (reminders.length === 0) {
      container.innerHTML = `
        <div class="tui-box-empty">
          ┌──────────────────────────────────────────────┐<br>
          │ NO REMINDERS SCHEDULED FOR THIS DATE.        │<br>
          │ Use prompt below to add a reminder or task.  │<br>
          └──────────────────────────────────────────────┘
        </div>
      `;
      return;
    }

    let listHtml = '';
    reminders.forEach(item => {
      const isOverdue = !item.isCompleted && (item.snoozedUntil || item.dueAt) < Date.now();
      const statusBoxClass = isOverdue ? 'item-overdue' : (item.isCompleted ? 'item-completed' : 'item-active');

      const repeatTag = item.repeat !== 'NONE' ? `<span class="tui-tag">[RPT: ${item.repeat}]</span>` : '';
      const priorityTag = item.priority === 'URGENT' ? '<span class="tui-tag tag-urgent">[! URGENT]</span>' : (item.priority === 'HIGH' ? '<span class="tui-tag tag-high">[* HIGH]</span>' : '');

      listHtml += `
        <div class="tui-card ${statusBoxClass}" data-id="${item.id}">
          <div class="tui-card-header">
            <span class="card-time">@ ${item.time || '09:00'}</span>
            ${priorityTag}
            ${repeatTag}
            ${isOverdue ? '<span class="tag-overdue-blink">[! OVERDUE !]</span>' : ''}
            ${item.isCompleted ? '<span class="tag-done">[DONE]</span>' : ''}
          </div>
          <div class="tui-card-title">${this.escapeHtml(item.title)}</div>
          ${item.details ? `<div class="tui-card-details">${this.escapeHtml(item.details)}</div>` : ''}
          <div class="tui-card-actions">
            <button class="tui-btn ${item.isCompleted ? 'btn-active' : ''}" data-action="toggle-done">
              ${item.isCompleted ? '[ UNDO ]' : '[ DONE ]'}
            </button>
            ${!item.isCompleted ? `
              <button class="tui-btn" data-action="snooze-10">
                [ +10M ]
              </button>
              <button class="tui-btn" data-action="snooze-1h">
                [ +1H ]
              </button>
            ` : ''}
            <button class="tui-btn btn-danger" data-action="delete">
              [ DEL ]
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = listHtml;

    // Attach card action listeners
    container.querySelectorAll('.tui-card').forEach(card => {
      const id = card.getAttribute('data-id');
      const btnDone = card.querySelector('[data-action="toggle-done"]');
      const btnSnooze10 = card.querySelector('[data-action="snooze-10"]');
      const btnSnooze1h = card.querySelector('[data-action="snooze-1h"]');
      const btnDelete = card.querySelector('[data-action="delete"]');

      if (btnDone) {
        btnDone.addEventListener('click', () => {
          window.storage.toggleReminderComplete(id);
          if (window.audio) window.audio.playSuccess();
        });
      }
      if (btnSnooze10) {
        btnSnooze10.addEventListener('click', () => {
          const item = window.storage.getReminders().find(r => r.id === id);
          if (item && window.notifier) {
            window.notifier.snoozeAlarm(item, '10m');
            if (window.audio) window.audio.playClick();
          }
        });
      }
      if (btnSnooze1h) {
        btnSnooze1h.addEventListener('click', () => {
          const item = window.storage.getReminders().find(r => r.id === id);
          if (item && window.notifier) {
            window.notifier.snoozeAlarm(item, '1h');
            if (window.audio) window.audio.playClick();
          }
        });
      }
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          window.storage.deleteReminder(id);
          if (window.audio) window.audio.playClick();
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

window.calendar = new CalendarView();
