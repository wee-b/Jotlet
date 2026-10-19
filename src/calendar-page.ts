import './calendar.css';
import {
  addDays,
  scheduleColors,
  dateKey,
  filterSchedules,
  monthDays,
  onDay,
  parseSchedule,
  weekStart,
} from './schedules';
import type { Schedule } from './schedules';
import type { EventRecord, Result } from './events';
import { beginTimeSelection } from './calendar-selection';
import { loadPreferences, savePreferences } from './preferences';
import { createSettings } from './settings-page';
import { createWindowControls } from './window-controls';

const paths: Record<string, string> = {
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 11h18M8 15h2m4 0h2"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12m6-12v12"/>',
  week: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18m6-18v18"/>',
  arrow: '<path d="m14 6-6 6 6 6"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  settings:
    '<path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1L9 21h4l.5-2.5 2-1 2 .5 2-3-1.5-2v-3L19.5 8l-2-3-2 .5-2-1L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="10.5" cy="7" r=".7"/><circle cx="15" cy="7.5" r=".7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 4C8 2 3 8 5 14s13 6 15-10ZM5 20l9-10"/>',
  timeline:
    '<path d="M5 4v16M5 7h5m-5 10h5"/><rect x="10" y="4" width="10" height="6" rx="2"/><rect x="10" y="14" width="10" height="6" rx="2"/>',
};
const svg = (name: string, extra = '') =>
  `<svg class="cal-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`;
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const monthLabel = (day: Date) =>
  `${day.getFullYear()}年${day.getMonth() + 1}月`;
const timeLabel = (value: string | Date) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
const localDateTime = (date: Date) =>
  `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

interface Options {
  getEvents(): EventRecord[];
  beforeNavigate(): Promise<void>;
  openEvent(id: string): Promise<void>;
  createEvent(
    title: string,
    startedAt: string,
    initialContent: string,
  ): Promise<EventRecord>;
  notify(text: string, error?: boolean): void;
}

export function createCalendar(options: Options) {
  document.documentElement.classList.toggle(
    'integrated-titlebar',
    !!window.jotletWindow?.integratedTitlebar,
  );
  const oldApp = document.querySelector<HTMLElement>('#app')!;
  const header = document.createElement('header');
  header.className = 'app-topbar';
  header.innerHTML = `<a class="cal-brand" href="#" aria-label="Jotlet 日历首页"><span class="cal-brand-mark">${svg('leaf')}</span>Jotlet<span class="cal-brand-period">.</span></a><nav class="app-pages" aria-label="页面导航"><button data-page="calendar" class="active">${svg('calendar')}日历</button><button data-page="events">${svg('timeline')}事件</button></nav><div class="topbar-right"><span class="cal-local"><i></i>本地保存</span><span class="topbar-separator"></span><button class="cal-primary" id="create-schedule" disabled>${svg('plus')}创建日程</button></div>`;
  const root = document.createElement('div');
  root.id = 'calendar-app';
  root.innerHTML = `
    <aside class="cal-sidebar">
      <section class="mini-calendar" aria-label="迷你月历"><div class="mini-toolbar"><h2 id="mini-title"></h2><div><button class="cal-icon-button" id="mini-prev" aria-label="迷你月历上个月">${svg('arrow')}</button><button class="cal-icon-button" id="mini-next" aria-label="迷你月历下个月">${svg('arrow', 'flipped')}</button></div></div><div class="mini-weekdays">${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<span>${day}</span>`).join('')}</div><div id="mini-days" class="mini-days"></div></section>
      <section class="day-agenda"><div class="sidebar-section-title"><h2 id="agenda-heading">当天日程</h2><span id="agenda-count"></span></div><p id="agenda-date"></p><div id="agenda-list"></div></section>
      <div class="sidebar-bottom"><div class="calendar-note">${svg('leaf')}<p>把时间，留给重要的事。<span>也给自己留一点空白。</span></p></div><span class="calendar-storage"><i></i>离线可用 · 数据只在本机</span></div>
    </aside>
    <main class="calendar-main"><div class="calendar-toolbar"><div class="calendar-title-group"><h1><label class="calendar-date-picker"><span id="calendar-title"></span>${svg('down')}<input type="date" id="calendar-jump" aria-label="跳转到日期"></label></h1><span id="calendar-subtitle"></span></div><div class="calendar-navigation"><button class="cal-secondary" id="calendar-event-filter" aria-pressed="false">只显示事件</button><button class="cal-secondary" id="calendar-today">今天</button><div class="calendar-arrows"><button class="cal-icon-button" id="calendar-prev" aria-label="上一周">${svg('arrow')}</button><button class="cal-icon-button" id="calendar-next" aria-label="下一周">${svg('arrow', 'flipped')}</button></div><span class="toolbar-divider"></span><div class="calendar-view-switch" role="group" aria-label="日历视图"><button data-calendar-view="week" class="active" aria-pressed="true">${svg('week')}周</button><button data-calendar-view="month" aria-pressed="false">${svg('grid')}月</button></div></div></div><div id="calendar-error" role="alert" hidden></div><section id="calendar-content" aria-label="周视图"></section><footer class="calendar-footer"><span>${svg('plus')}点击空白处创建日程</span><span id="visible-schedule-count">0 个日程</span></footer></main>
  `;
  const dialog = document.createElement('dialog');
  dialog.id = 'schedule-dialog';
  dialog.className = 'schedule-dialog';
  dialog.setAttribute('aria-labelledby', 'schedule-dialog-title');
  dialog.innerHTML = `<form id="schedule-form"><div class="schedule-dialog-header"><span class="schedule-dialog-tag">${svg('calendar')}<span id="schedule-dialog-title">新建日程</span></span><button type="button" class="cal-icon-button" id="close-schedule" aria-label="关闭日程编辑">${svg('close')}</button></div><input id="schedule-title" class="schedule-title-input" aria-label="日程主题" maxlength="500" placeholder="为这段时间起个名字" required><div class="schedule-form-row time-row">${svg('clock')}<div class="schedule-fields"><div class="all-day-field"><label><input type="checkbox" id="schedule-all-day">全天日程</label><span>本地时间</span></div><div class="schedule-time-range"><label><span>开始</span><input id="schedule-start" type="datetime-local" required></label><span class="range-dash">—</span><label><span>结束</span><input id="schedule-end" type="datetime-local" required></label></div></div></div><div class="schedule-form-row">${svg('link')}<div class="schedule-fields"><label class="schedule-field-label" for="schedule-event">绑定事件 <span>可选</span></label><select id="schedule-event"><option value="">不绑定事件（独立日程）</option></select><div id="schedule-new-event" hidden><label class="schedule-field-label" for="schedule-new-event-title">新事件名称</label><div class="schedule-new-event-controls"><input id="schedule-new-event-title" type="text" maxlength="500" placeholder="给新事件起个名字"><button type="button" class="cal-secondary" id="schedule-create-event">创建并绑定</button></div></div><p id="schedule-event-hint">直接保存即可创建独立日程，无需创建事件。</p><button type="button" id="open-linked-event" class="cal-text-button" hidden>查看事件追踪 ↗</button></div></div><div class="schedule-form-row">${svg('text')}<div class="schedule-fields"><label class="schedule-field-label" for="schedule-description">描述 <span>可选</span></label><textarea id="schedule-description" maxlength="100000" placeholder="添加一些备注、想法或准备事项…" rows="3"></textarea></div></div><div class="schedule-form-row">${svg('palette')}<fieldset class="schedule-fields schedule-color-picker"><legend class="schedule-field-label">日程颜色</legend><div class="schedule-color-options">${Object.entries(
    scheduleColors,
  )
    .map(
      ([key, name]) =>
        `<label class="schedule-color-option"><input class="sr-only" type="radio" name="schedule-color" value="${key}" ${key === 'sage' ? 'checked' : ''}><span class="schedule-color-dot schedule-color-${key}">${svg('check')}</span><span>${name}</span></label>`,
    )
    .join(
      '',
    )}</div></fieldset></div><p id="schedule-form-error" class="schedule-form-error" role="alert" hidden></p><div class="schedule-dialog-footer"><button type="button" id="remove-schedule" class="cal-text-button cal-danger" hidden>删除日程</button><span class="schedule-save-hint">${svg('check')}保存到本机</span><div><button type="button" id="cancel-schedule" class="cal-secondary">取消</button><button type="submit" id="save-schedule" class="cal-primary">保存日程</button></div></div></form>`;
  const deleteDialog = document.createElement('dialog');
  deleteDialog.className = 'schedule-confirm-dialog';
  deleteDialog.setAttribute('aria-labelledby', 'schedule-delete-title');
  deleteDialog.innerHTML =
    '<h2 id="schedule-delete-title">删除这个日程？</h2><p>此操作无法撤销，关联的事件和时间线会保留。</p><p class="schedule-form-error" id="schedule-delete-error" role="alert" hidden></p><div><button class="cal-secondary" id="cancel-schedule-delete">取消</button><button class="cal-primary cal-delete-button" id="confirm-schedule-delete">删除日程</button></div>';
  document.body.prepend(header);
  createWindowControls(header, options.notify);
  const calendarActions = header.querySelector<HTMLElement>('.topbar-right')!;
  calendarActions.className = 'calendar-page-actions';
  root.querySelector('.calendar-toolbar')!.append(calendarActions);
  oldApp.after(root, dialog, deleteDialog);
  // Shared overlays must remain visible while the event workspace is hidden.
  document.body.append(
    document.querySelector('#toast')!,
    document.querySelector('#info-dialog')!,
  );
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector)!;
  let preferences = loadPreferences();
  let view: 'month' | 'week' = preferences.defaultView;
  let resetWeekScroll = false;
  let selected = addDays(new Date(), 0);
  let miniDate = selected;
  let schedules: Schedule[] = [];

  let linkedOnly = false;
  let allDayContext = '';
  let allDayExpanded = false;
  let ready = false;
  let busy = false;
  let editing: Schedule | null = null;
  let cancelTimeSelection: (() => void) | undefined;
  const newEventOption = `new-event:${crypto.randomUUID()}`;
  const settings = createSettings({
    getPreferences: () => preferences,
    save: (value) => {
      preferences = savePreferences(value);
      view = preferences.defaultView;
      resetWeekScroll = true;
    },
    back: () => {
      void navigate('calendar');
    },
    beforeDataChange: options.beforeNavigate,
  });
  for (const anchor of [$('.calendar-storage'), $('.sidebar-footer')]) {
    const button = document.createElement('button');
    button.className = 'settings-entry';
    button.innerHTML = `${svg('settings')}<span>设置</span><span>›</span>`;
    button.addEventListener('click', () => {
      void navigate('settings');
    });
    anchor.before(button);
  }
  const today = () => dateKey(new Date());
  const filtered = () =>
    filterSchedules(schedules, options.getEvents(), '', linkedOnly);
  const itemsFor = (day: Date) =>
    filtered()
      .filter((item) => onDay(item, day))
      .sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
      );
  const dayLabel = (day: Date) => `${day.getMonth() + 1}月${day.getDate()}日`;

  function scheduleButton(
    item: Schedule,
    type = 'month-schedule',
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = `${type} schedule-color-${item.color}`;
    button.dataset.scheduleId = item.id;
    const linkedEvent = options
      .getEvents()
      .find((event) => event.id === item.eventId);
    const linkedName = item.eventId
      ? linkedEvent
        ? linkedEvent.title.trim() || '未命名事件'
        : '关联事件已删除'
      : '';
    button.classList.toggle('has-linked-event', !!linkedName);
    button.title = `${item.title}\n${item.allDay ? '全天' : `${timeLabel(item.start)} – ${timeLabel(item.end)}`}${linkedName ? `\n关联事件：${linkedName}` : ''}${item.description ? `\n${item.description}` : ''}`;
    button.setAttribute('aria-label', button.title);
    const association = document.createElement('span');
    if (linkedName) {
      association.className = 'schedule-linked-event';
      association.innerHTML = svg('link');
      const label = document.createElement('span');
      label.textContent = linkedName;
      association.append(label);
    }
    const name = document.createElement('strong');
    name.textContent = item.title;
    if (type === 'agenda-item') {
      const time = document.createElement('span');
      time.className = 'agenda-time';
      time.textContent = item.allDay ? '全天' : timeLabel(item.start);
      const details = document.createElement('div');
      const subtitle = document.createElement('span');
      subtitle.textContent = item.allDay
        ? '全天日程'
        : `${timeLabel(item.start)} – ${timeLabel(item.end)}`;
      details.append(name, subtitle);
      if (linkedName) details.append(association);
      button.append(time, details);
    } else {
      const time = document.createElement('span');
      time.className = 'schedule-time';
      time.textContent = item.allDay ? '全天' : timeLabel(item.start);
      button.append(name, time);
      if (linkedName) button.append(association);
    }
    button.addEventListener('click', () =>
      openSchedule(new Date(item.start), item),
    );
    return button;
  }

  function renderMini() {
    $('#mini-title').textContent = monthLabel(miniDate);
    const container = $('#mini-days');
    container.replaceChildren();
    const start = weekStart(selected);
    monthDays(miniDate, true).forEach((day) => {
      const button = document.createElement('button');
      const key = dateKey(day);
      button.className = `mini-day${day.getMonth() !== miniDate.getMonth() ? ' outside' : ''}${key === today() ? ' today' : ''}${key === dateKey(selected) ? ' selected' : ''}${view === 'week' && day >= start && day < addDays(start, 7) ? ' in-week' : ''}`;
      button.innerHTML = `<span>${day.getDate()}</span>${itemsFor(day).length ? '<i></i>' : ''}`;
      button.setAttribute(
        'aria-label',
        `${day.getFullYear()}年${dayLabel(day)}`,
      );
      button.setAttribute('aria-pressed', String(key === dateKey(selected)));
      if (key === today()) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => {
        selected = day;
        miniDate = day;
        render();
      });
      container.append(button);
    });
  }
  function renderAgenda() {
    $('#agenda-heading').textContent =
      dateKey(selected) === today() ? '今天的日程' : '当天日程';
    $('#agenda-date').textContent =
      `${dayLabel(selected)}，${weekdays[selected.getDay()]}`;
    const items = itemsFor(selected);
    $('#agenda-count').textContent = String(items.length).padStart(2, '0');
    const list = $('#agenda-list');
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'agenda-empty';
      empty.innerHTML = `${svg('calendar')}<p>${linkedOnly ? '这一天，没有绑定事件的日程' : '这一天，还没有安排'}</p><button class="cal-text-button" ${ready ? '' : 'disabled'}>＋ 添加一个日程</button>`;
      empty
        .querySelector('button')!
        .addEventListener('click', () => openSchedule(selected));
      list.append(empty);
    } else
      items.forEach((item) => list.append(scheduleButton(item, 'agenda-item')));
  }
  function renderMonth() {
    const content = $('#calendar-content');
    content.className = 'month-view';
    content.innerHTML = `<div class="month-weekdays">${weekdays.map((name, index) => `<span class="${index === 0 || index === 6 ? 'weekend' : ''}">${name}</span>`).join('')}</div><div class="month-grid" id="month-grid"></div>`;
    const days = monthDays(selected);
    const grid = $('#month-grid');
    grid.style.setProperty('--month-rows', String(days.length / 7));
    days.forEach((day) => {
      const key = dateKey(day);
      const cell = document.createElement('div');
      cell.className = `month-day${day.getMonth() !== selected.getMonth() ? ' outside' : ''}${key === today() ? ' is-today' : ''}${key === dateKey(selected) ? ' is-selected' : ''}${[0, 6].includes(day.getDay()) ? ' weekend' : ''}`;
      const dateButton = document.createElement('button');
      dateButton.className = 'month-day-number';
      dateButton.textContent =
        day.getDate() === 1
          ? `${day.getMonth() + 1}月1日`
          : String(day.getDate());
      dateButton.setAttribute('aria-label', `选择${dayLabel(day)}`);
      if (key === today()) dateButton.setAttribute('aria-current', 'date');
      dateButton.addEventListener('click', () => {
        selected = day;
        miniDate = day;
        render();
      });
      const add = document.createElement('button');
      add.className = 'month-day-add';
      add.innerHTML = svg('plus');
      add.setAttribute('aria-label', `${dayLabel(day)}创建日程`);
      add.addEventListener('click', () => {
        selected = day;
        miniDate = day;
        render();
        openSchedule(day);
      });
      cell.append(dateButton, add);
      const items = itemsFor(day);
      const eventList = document.createElement('div');
      eventList.className = 'month-day-events';
      eventList.dataset.total = String(items.length);
      items
        .slice(0, 3)
        .forEach((item) => eventList.append(scheduleButton(item)));
      if (items.length) {
        const more = document.createElement('button');
        more.className = 'more-schedules';
        more.textContent = `还有 ${items.length - 3} 个日程`;
        more.addEventListener('click', () => {
          selected = day;
          miniDate = day;
          view = 'week';
          render();
        });
        eventList.append(more);
      }
      cell.append(eventList);
      grid.append(cell);
    });
    fitMonthSchedules();
  }
  function fitMonthSchedules() {
    if (root.hidden || view !== 'month') return;
    root.querySelectorAll<HTMLElement>('.month-day-events').forEach((list) => {
      const buttons = [
        ...list.querySelectorAll<HTMLElement>('.month-schedule'),
      ];
      const more = list.querySelector<HTMLElement>('.more-schedules');
      if (!buttons.length || !more) return;
      const cell = list.parentElement!;
      const total = Number(list.dataset.total);
      const available =
        cell.getBoundingClientRect().bottom -
        list.getBoundingClientRect().top -
        parseFloat(getComputedStyle(cell).paddingBottom);
      const gap = parseFloat(getComputedStyle(list).rowGap);
      const itemHeight = parseFloat(getComputedStyle(buttons[0]).height);
      more.hidden = false;
      const moreHeight = more.getBoundingClientRect().height;
      let count = buttons.length;
      while (count > 0) {
        const height = count * (itemHeight + gap) - gap;
        if (height + (count < total ? moreHeight + gap : 0) <= available) break;
        count--;
      }
      buttons.forEach((button, index) => (button.hidden = index >= count));
      more.hidden = count === total;
      more.textContent = `还有 ${total - count} 个日程`;
    });
  }
  function renderWeek() {
    const previousScroll = resetWeekScroll
      ? undefined
      : document.querySelector('.week-scroll')?.scrollTop;
    resetWeekScroll = false;
    const days = Array.from({ length: 7 }, (_, index) =>
      addDays(weekStart(selected), index),
    );
    const content = $('#calendar-content');
    content.className = 'week-view';
    const hasAllDay = days.some((day) =>
      itemsFor(day).some((item) => item.allDay),
    );
    const context = `${dateKey(days[0])}:${linkedOnly}:${hasAllDay}`;
    if (context !== allDayContext) {
      allDayContext = context;
      allDayExpanded = hasAllDay;
    }
    content.innerHTML = `<div class="week-date-row"><div class="week-timezone"><span>GMT${-new Date().getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-new Date().getTimezoneOffset() / 60}</span><button type="button" id="toggle-all-day" aria-controls="week-all-day">全天 ${svg('down')}</button></div>${days.map((day) => `<button class="week-date${dateKey(day) === today() ? ' is-today' : ''}${dateKey(day) === dateKey(selected) ? ' is-selected' : ''}" data-week-day="${dateKey(day)}"><span>${weekdays[day.getDay()]}</span><strong>${day.getDate()}</strong></button>`).join('')}</div><div class="week-all-day" id="week-all-day"><span>全天</span>${days.map((day) => `<div data-all-day="${dateKey(day)}"></div>`).join('')}</div><div class="week-scroll"><div class="week-grid"><div class="week-hours">${Array.from({ length: 24 }, (_, hour) => `<span style="top:${hour * 64}px">${String(hour).padStart(2, '0')}:00</span>`).join('')}</div>${days.map((day) => `<div class="week-column${dateKey(day) === today() ? ' is-today' : ''}" data-column="${dateKey(day)}"></div>`).join('')}<div class="current-time-line" hidden><span></span></div></div></div>`;
    const allDayToggle =
      content.querySelector<HTMLButtonElement>('#toggle-all-day')!;
    const allDayRow = content.querySelector<HTMLElement>('#week-all-day')!;
    const updateAllDayVisibility = () => {
      allDayRow.hidden = !allDayExpanded;
      allDayToggle.setAttribute('aria-expanded', String(allDayExpanded));
      allDayToggle.setAttribute(
        'aria-label',
        allDayExpanded ? '收起全天日程' : '展开全天日程',
      );
      allDayToggle.title = allDayExpanded ? '收起全天日程' : '展开全天日程';
    };
    updateAllDayVisibility();
    allDayToggle.addEventListener('click', () => {
      allDayExpanded = !allDayExpanded;
      updateAllDayVisibility();
    });
    content.querySelectorAll<HTMLElement>('[data-week-day]').forEach((button) =>
      button.addEventListener('click', () => {
        selected = new Date(`${button.dataset.weekDay}T00:00:00`);
        miniDate = selected;
        render();
      }),
    );
    days.forEach((day) => {
      const column = content.querySelector<HTMLElement>(
        `[data-column="${dateKey(day)}"]`,
      )!;
      const selectRange = (startMinute: number, endMinute: number) => {
        selected = day;
        miniDate = day;
        renderMini();
        renderAgenda();
        const start = new Date(day);
        const end = new Date(day);
        start.setMinutes(startMinute);
        end.setMinutes(endMinute);
        openSchedule(start, null, true, end);
      };
      column.addEventListener('pointerdown', (event) => {
        if (
          !ready ||
          busy ||
          event.button !== 0 ||
          !event.isPrimary ||
          !(event.target instanceof Element) ||
          !event.target.closest('.week-slot')
        )
          return;
        event.preventDefault();
        cancelTimeSelection?.();
        cancelTimeSelection = beginTimeSelection(
          column,
          content.querySelector<HTMLElement>('.week-scroll')!,
          event,
          selectRange,
        );
      });
      // Half-hour hit areas share an hourly grid: only every second area has a line.
      for (let halfHour = 0; halfHour < 48; halfHour++) {
        const slot = document.createElement('button');
        slot.className = 'week-slot';
        slot.setAttribute(
          'aria-label',
          `${dayLabel(day)} ${String(Math.floor(halfHour / 2)).padStart(2, '0')}:${halfHour % 2 ? '30' : '00'} 创建半小时日程，按住拖动选择时长`,
        );
        slot.addEventListener('click', (event) => {
          // Pointer selection is completed on pointerup; retain keyboard activation.
          if (event.detail === 0)
            selectRange(halfHour * 30, halfHour * 30 + 30);
        });
        column.append(slot);
      }
      const entries = itemsFor(day);
      const allDayCell = content.querySelector<HTMLElement>(
        `[data-all-day="${dateKey(day)}"]`,
      )!;
      allDayCell.addEventListener('dblclick', () => {
        openSchedule(day);
        $<HTMLInputElement>('#schedule-all-day').checked = true;
        updateAllDay();
      });
      entries
        .filter((item) => item.allDay)
        .forEach((item) => allDayCell.append(scheduleButton(item)));
      const timed = entries
        .filter((item) => !item.allDay)
        .map((item) => ({
          item,
          start: Math.max(new Date(item.start).getTime(), day.getTime()),
          end: Math.min(
            new Date(item.end).getTime(),
            addDays(day, 1).getTime(),
          ),
          lane: 0,
        }));
      // Split simultaneous events into lanes instead of covering each other.
      let group: typeof timed = [];
      let groupEnd = 0;
      const placeGroup = () => {
        const laneEnds: number[] = [];
        group.forEach((entry) => {
          let lane = laneEnds.findIndex((end) => end <= entry.start);
          if (lane === -1) lane = laneEnds.length;
          laneEnds[lane] = entry.end;
          entry.lane = lane;
        });
        group.forEach((entry) => {
          const button = scheduleButton(entry.item, 'week-schedule');
          const startDate = new Date(entry.start);
          const minute = startDate.getHours() * 60 + startDate.getMinutes();
          button.style.top = `${(minute / 60) * 64}px`;
          const height = Math.max(
            21,
            ((entry.end - entry.start) / 3_600_000) * 64 - 2,
          );
          button.style.height = `${height}px`;
          button.classList.toggle('is-compact', height < 50);
          button.classList.toggle('is-tiny', height < 28);
          button.style.left = `calc(${(entry.lane / laneEnds.length) * 100}% + 3px)`;
          button.style.width = `calc(${100 / laneEnds.length}% - 6px)`;
          column.append(button);
        });
      };
      timed.forEach((entry) => {
        if (group.length && entry.start >= groupEnd) {
          placeGroup();
          group = [];
          groupEnd = 0;
        }
        group.push(entry);
        groupEnd = Math.max(groupEnd, entry.end);
      });
      placeGroup();
    });
    updateNow();
    content.querySelector('.week-scroll')!.scrollTop =
      previousScroll ?? preferences.weekStartHour * 64;
  }
  function updateNow() {
    const line = document.querySelector<HTMLElement>('.current-time-line');
    if (!line) return;
    const now = new Date();
    const start = weekStart(selected);
    line.hidden = !(now >= start && now < addDays(start, 7));
    line.style.top = `${(now.getHours() + now.getMinutes() / 60) * 64}px`;
    line.style.setProperty('--today-column', String(now.getDay()));
    line.querySelector('span')!.textContent = timeLabel(now);
  }
  function render() {
    cancelTimeSelection?.();
    $('#calendar-event-filter').textContent = linkedOnly
      ? '全部显示'
      : '只显示事件';
    $('#calendar-event-filter').setAttribute(
      'aria-pressed',
      String(linkedOnly),
    );
    $('#calendar-event-filter').title = linkedOnly
      ? '当前只显示已绑定事件的日程，点击显示全部日程'
      : '当前显示全部日程，点击只显示已绑定事件的日程';
    const end = addDays(weekStart(selected), 6);
    $('#calendar-title').textContent =
      view === 'month'
        ? monthLabel(selected)
        : `${monthLabel(weekStart(selected))}${weekStart(selected).getDate()}日 – ${end.getMonth() !== weekStart(selected).getMonth() ? `${end.getMonth() + 1}月` : ''}${end.getDate()}日`;
    $('#calendar-subtitle').textContent =
      view === 'month' ? '每一天，都有新的可能' : '让这一周，有条不紊';
    $('.calendar-footer > span').innerHTML =
      `${svg('plus')}${view === 'week' ? '单击创建半小时日程 · 按住拖动选择时长' : '点击空白处创建日程'}`;
    $<HTMLInputElement>('#calendar-jump').value = dateKey(selected);
    $('#calendar-prev').setAttribute(
      'aria-label',
      view === 'month' ? '上个月' : '上一周',
    );
    $('#calendar-next').setAttribute(
      'aria-label',
      view === 'month' ? '下个月' : '下一周',
    );
    document
      .querySelectorAll<HTMLElement>('[data-calendar-view]')
      .forEach((button) => {
        button.classList.toggle('active', button.dataset.calendarView === view);
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.calendarView === view),
        );
      });
    $('#calendar-content').setAttribute(
      'aria-label',
      view === 'month' ? '月视图' : '周视图',
    );
    renderMini();
    renderAgenda();
    if (view === 'month') renderMonth();
    else renderWeek();
    const visibleStart =
      view === 'month' ? monthDays(selected)[0] : weekStart(selected);
    const visibleEnd =
      view === 'month'
        ? addDays(monthDays(selected).at(-1)!, 1)
        : addDays(visibleStart, 7);
    const count = filtered().filter(
      (item) =>
        new Date(item.start) < visibleEnd && new Date(item.end) > visibleStart,
    ).length;
    $('#visible-schedule-count').textContent =
      `${linkedOnly ? '只显示事件 · ' : ''}${count} 个日程`;
  }
  async function navigate(page: 'calendar' | 'events' | 'settings') {
    try {
      await options.beforeNavigate();
      cancelTimeSelection?.();
      oldApp.hidden = page !== 'events';
      root.hidden = page !== 'calendar';
      settings.root.hidden = page !== 'settings';
      if (page === 'settings') settings.refresh();
      document.body.classList.toggle('calendar-active', page === 'calendar');
      header.querySelectorAll<HTMLElement>('[data-page]').forEach((button) => {
        button.classList.toggle('active', button.dataset.page === page);
        button.setAttribute(
          'aria-current',
          button.dataset.page === page ? 'page' : 'false',
        );
      });
      if (page === 'calendar') render();
    } catch (error) {
      options.notify(errorText(error), true);
    }
  }
  function updateAllDay() {
    const allDay = $<HTMLInputElement>('#schedule-all-day').checked;
    const start = $<HTMLInputElement>('#schedule-start');
    const end = $<HTMLInputElement>('#schedule-end');
    if (allDay) {
      const date = new Date(start.value || selected);
      const ending = new Date(end.value || date);
      start.type = 'date';
      end.type = 'date';
      start.value = dateKey(date);
      end.value = dateKey(ending < date ? date : ending);
    } else {
      const startDate = new Date(`${start.value}T09:00:00`);
      const endDate = new Date(`${end.value}T09:00:00`);
      endDate.setMinutes(endDate.getMinutes() + preferences.defaultDuration);
      start.type = 'datetime-local';
      end.type = 'datetime-local';
      start.value = localDateTime(startDate);
      end.value = localDateTime(endDate);
    }
  }
  function openSchedule(
    date: Date,
    item: Schedule | null = null,
    exactTime = false,
    selectedEnd?: Date,
  ) {
    if (!ready || busy) return;
    editing = item;
    const form = $<HTMLFormElement>('#schedule-form');
    form.reset();
    $('#schedule-dialog-title').textContent = item ? '编辑日程' : '新建日程';
    $<HTMLInputElement>('#schedule-title').value = item?.title || '';
    $<HTMLTextAreaElement>('#schedule-description').value =
      item?.description || '';
    $<HTMLInputElement>(
      `input[name="schedule-color"][value="${item?.color ?? preferences.defaultColor}"]`,
    ).checked = true;
    const start = new Date(item?.start ?? date);
    if (!item && !exactTime) start.setHours(9, 0, 0, 0);
    const end = item
      ? new Date(item.end)
      : (selectedEnd ??
        new Date(start.getTime() + preferences.defaultDuration * 60_000));
    const allDay = item?.allDay ?? false;
    $<HTMLInputElement>('#schedule-all-day').checked = allDay;
    const startInput = $<HTMLInputElement>('#schedule-start');
    const endInput = $<HTMLInputElement>('#schedule-end');
    startInput.type = endInput.type = allDay ? 'date' : 'datetime-local';
    startInput.value = allDay ? dateKey(start) : localDateTime(start);
    endInput.value = allDay ? dateKey(addDays(end, -1)) : localDateTime(end);
    const select = $<HTMLSelectElement>('#schedule-event');
    select.replaceChildren(new Option('不绑定事件（独立日程）', ''));
    options
      .getEvents()
      .forEach((event) =>
        select.add(new Option(event.title.trim() || '未命名事件', event.id)),
      );
    if (
      item?.eventId &&
      !options.getEvents().some((event) => event.id === item.eventId)
    )
      select.add(new Option('原关联事件已删除', item.eventId));
    select.add(new Option('＋ 新建事件并绑定…', newEventOption));
    select.value = item?.eventId || '';
    updateEventLink();
    $('#remove-schedule').hidden = !item;
    $('#schedule-form-error').hidden = true;
    dialog.showModal();
    $('#schedule-title').focus();
  }
  function updateEventLink() {
    const id = $<HTMLSelectElement>('#schedule-event').value;
    const creating = id === newEventOption;
    $('#schedule-new-event').hidden = !creating;
    if (creating) $('#schedule-new-event-title').focus();
    $('#open-linked-event').hidden = !options
      .getEvents()
      .some((item) => item.id === id);
    $('#schedule-event-hint').textContent = creating
      ? '点击“创建并绑定”将创建事件，并用当前日程主题、描述和开始时间添加一条初始记录。'
      : id
        ? '日程将关联所选事件，可以随时取消绑定。'
        : '直接保存即可创建独立日程，无需创建事件。';
  }
  function setBusy(value: boolean) {
    busy = value;
    dialog
      .querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        'input, textarea, select, button',
      )
      .forEach((input) => {
        input.disabled = value;
      });
    deleteDialog
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) => {
        button.disabled = value;
      });
    $('#save-schedule').textContent = value ? '保存中…' : '保存日程';
  }
  header.querySelectorAll<HTMLElement>('[data-page]').forEach((button) =>
    button.addEventListener('click', () => {
      void navigate(button.dataset.page as 'calendar' | 'events');
    }),
  );
  $('.cal-brand').addEventListener('click', (event) => {
    event.preventDefault();
    void navigate('calendar');
  });
  $('#create-schedule').addEventListener('click', () => openSchedule(selected));
  $('#calendar-event-filter').addEventListener('click', () => {
    linkedOnly = !linkedOnly;
    render();
  });
  $('#calendar-today').addEventListener('click', () => {
    selected = addDays(new Date(), 0);
    miniDate = selected;
    render();
  });
  const shift = (direction: number) => {
    selected =
      view === 'month'
        ? new Date(selected.getFullYear(), selected.getMonth() + direction, 1)
        : addDays(selected, direction * 7);
    miniDate = selected;
    render();
  };
  $('#calendar-prev').addEventListener('click', () => shift(-1));
  $('#calendar-next').addEventListener('click', () => shift(1));
  $('#mini-prev').addEventListener('click', () => {
    miniDate = new Date(miniDate.getFullYear(), miniDate.getMonth() - 1, 1);
    renderMini();
  });
  $('#mini-next').addEventListener('click', () => {
    miniDate = new Date(miniDate.getFullYear(), miniDate.getMonth() + 1, 1);
    renderMini();
  });
  $('#calendar-jump').addEventListener('change', () => {
    const value = $<HTMLInputElement>('#calendar-jump').value;
    if (value) {
      selected = new Date(`${value}T00:00:00`);
      miniDate = selected;
      render();
    }
  });
  document
    .querySelectorAll<HTMLElement>('[data-calendar-view]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        view = button.dataset.calendarView as 'month' | 'week';
        render();
      }),
    );
  $('#close-schedule').addEventListener('click', () => dialog.close());
  $('#cancel-schedule').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  deleteDialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  $('#schedule-all-day').addEventListener('change', updateAllDay);
  $('#schedule-event').addEventListener('change', updateEventLink);
  $('#schedule-create-event').addEventListener('click', () => {
    if (busy) return;
    void (async () => {
      setBusy(true);
      $('#schedule-form-error').hidden = true;
      try {
        const title = $<HTMLInputElement>(
          '#schedule-new-event-title',
        ).value.trim();
        if (!title) throw new Error('请填写新事件的名称。');
        const startValue = $<HTMLInputElement>('#schedule-start').value;
        const startedAt = new Date(
          $<HTMLInputElement>('#schedule-all-day').checked
            ? `${startValue}T00:00:00`
            : startValue,
        );
        if (!Number.isFinite(startedAt.getTime()))
          throw new Error('请先选择有效的开始时间。');
        const created = await options.createEvent(
          title,
          startedAt.toISOString(),
          [
            $<HTMLInputElement>('#schedule-title').value.trim() || title,
            $<HTMLTextAreaElement>('#schedule-description').value.trim(),
          ]
            .filter(Boolean)
            .join('\n\n'),
        );
        const select = $<HTMLSelectElement>('#schedule-event');
        select.add(
          new Option(created.title, created.id),
          select.options.length - 1,
        );
        select.value = created.id;
        updateEventLink();
        options.notify('事件及初始记录已创建，保存日程后完成绑定。');
      } catch (error) {
        $('#schedule-form-error').textContent = errorText(error);
        $('#schedule-form-error').hidden = false;
      } finally {
        setBusy(false);
      }
    })();
  });
  $('#schedule-new-event-title').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      $('#schedule-create-event').click();
    }
  });
  $('#open-linked-event').addEventListener('click', () => {
    const id = $<HTMLSelectElement>('#schedule-event').value;
    void (async () => {
      try {
        await options.openEvent(id);
        dialog.close();
        await navigate('events');
      } catch (error) {
        options.notify(errorText(error), true);
      }
    })();
  });
  $('#schedule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    void (async () => {
      setBusy(true);
      try {
        if ($<HTMLSelectElement>('#schedule-event').value === newEventOption)
          throw new Error(
            '请先点击“创建并绑定”，或选择“不绑定事件”直接保存日程。',
          );
        const allDay = $<HTMLInputElement>('#schedule-all-day').checked;
        const startValue = $<HTMLInputElement>('#schedule-start').value;
        const endValue = $<HTMLInputElement>('#schedule-end').value;
        const start = new Date(allDay ? `${startValue}T00:00:00` : startValue);
        const end = allDay
          ? addDays(new Date(`${endValue}T00:00:00`), 1)
          : new Date(endValue);
        const now = new Date().toISOString();
        const schedule = parseSchedule({
          id: editing?.id ?? crypto.randomUUID(),
          title: $<HTMLInputElement>('#schedule-title').value,
          start: start.toISOString(),
          end: end.toISOString(),
          allDay,
          color: $<HTMLInputElement>('input[name="schedule-color"]:checked')
            .value,
          eventId: $<HTMLSelectElement>('#schedule-event').value || null,
          description: $<HTMLTextAreaElement>('#schedule-description').value,
          createdAt: editing?.createdAt ?? now,
          updatedAt: now,
        });
        const saved = unwrap(await window.jotletCalendar.save(schedule));
        schedules = [
          ...schedules.filter((item) => item.id !== saved.id),
          saved,
        ];
        selected = addDays(start, 0);
        miniDate = selected;
        dialog.close();
        render();
        const hiddenByFilter =
          linkedOnly &&
          !options.getEvents().some((event) => event.id === saved.eventId);
        options.notify(
          `${editing ? '日程已更新' : '日程已创建'}${hiddenByFilter ? '，切换“全部显示”即可查看独立日程。' : ''}`,
        );
      } catch (error) {
        $('#schedule-form-error').textContent = errorText(error);
        $('#schedule-form-error').hidden = false;
      } finally {
        setBusy(false);
      }
    })();
  });
  $('#remove-schedule').addEventListener('click', () => {
    $('#schedule-delete-error').hidden = true;
    deleteDialog.showModal();
  });
  $('#cancel-schedule-delete').addEventListener('click', () =>
    deleteDialog.close(),
  );
  $('#confirm-schedule-delete').addEventListener('click', () => {
    if (!editing || busy) return;
    const id = editing.id;
    void (async () => {
      setBusy(true);
      try {
        unwrap(await window.jotletCalendar.remove(id));
        schedules = schedules.filter((item) => item.id !== id);
        deleteDialog.close();
        dialog.close();
        render();
        options.notify('日程已删除');
      } catch (error) {
        $('#schedule-delete-error').textContent = errorText(error);
        $('#schedule-delete-error').hidden = false;
      } finally {
        setBusy(false);
      }
    })();
  });
  document.addEventListener('keydown', (event) => {
    if (
      !document.body.classList.contains('calendar-active') ||
      document.querySelector('dialog[open]') ||
      !(event.ctrlKey || event.metaKey)
    )
      return;
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      openSchedule(selected);
    }
  });
  oldApp.hidden = true;
  new ResizeObserver(fitMonthSchedules).observe($('#calendar-content'));
  document.body.classList.add('calendar-active');
  render();
  setInterval(updateNow, 60_000);
  async function initialize() {
    try {
      if (!window.jotletCalendar)
        throw new Error('请通过 Jotlet 桌面应用打开，以读取本地日程。');
      schedules = unwrap(await window.jotletCalendar.load());
      ready = true;
      $<HTMLButtonElement>('#create-schedule').disabled = false;
      render();
    } catch (error) {
      $('#calendar-error').hidden = false;
      $('#calendar-error').textContent = errorText(error);
    }
  }
  void initialize();
  return {
    refresh: render,
    replaceSchedules(items: Schedule[]) {
      schedules = items;
      render();
      settings.refresh();
    },
  };
}
