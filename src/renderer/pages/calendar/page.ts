import {
  calendarTemplate,
  scheduleDialogTemplate,
  deleteScheduleTemplate,
} from './template';
import {
  addDays,
  dateKey,
  filterSchedules,
  monthDays,
  onDay,
  parseSchedule,
  weekStart,
} from '../../../shared/schedules';
import type { Schedule } from '../../../shared/schedules';
import type { EventRecord } from '../../../shared/events';
import { unwrap, errorText } from '../../utils/result';
import { weekdays, monthLabel, localDateTime, today, dayLabel } from './dates';
import { createWeekView } from './week-view';
import { createMonthView } from './month-view';
import { createScheduleButton } from './schedule-button';
import { loadPreferences, savePreferences } from '../settings/preferences';

import { calendarIcon as svg } from '../../components/icons';
interface Options {
  getEvents(): EventRecord[];
  navigate(page: 'calendar' | 'events' | 'settings'): Promise<void>;
  openEvent(id: string): Promise<void>;
  createEvent(
    title: string,
    startedAt: string,
    initialContent: string,
  ): Promise<EventRecord>;
  notify(text: string, error?: boolean): void;
}

export function createCalendar(options: Options) {
  const root = document.createElement('div');
  root.id = 'calendar-app';
  root.innerHTML = calendarTemplate();
  const dialog = document.createElement('dialog');
  dialog.id = 'schedule-dialog';
  dialog.className = 'schedule-dialog';
  dialog.setAttribute('aria-labelledby', 'schedule-dialog-title');
  dialog.innerHTML = scheduleDialogTemplate();
  const deleteDialog = document.createElement('dialog');
  deleteDialog.className = 'schedule-confirm-dialog';
  deleteDialog.setAttribute('aria-labelledby', 'schedule-delete-title');
  deleteDialog.innerHTML = deleteScheduleTemplate();
  document.querySelector('#app')!.after(root, dialog, deleteDialog);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector)!;
  let preferences = loadPreferences();
  let view: 'month' | 'week' = preferences.defaultView;
  let resetWeekScroll = false;
  let selected = addDays(new Date(), 0);
  let miniDate = selected;
  let schedules: Schedule[] = [];

  let linkedOnly = false;
  let ready = false;
  let busy = false;
  let editing: Schedule | null = null;
  const newEventOption = `new-event:${crypto.randomUUID()}`;
  const filtered = () =>
    filterSchedules(schedules, options.getEvents(), '', linkedOnly);
  const itemsFor = (day: Date) =>
    filtered()
      .filter((item) => onDay(item, day))
      .sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
      );

  const scheduleButton = (item: Schedule, type?: string) =>
    createScheduleButton(
      item,
      options.getEvents,
      (schedule) => openSchedule(new Date(schedule.start), schedule),
      type,
    );
  const content = $('#calendar-content');
  const selectDay = (day: Date) => {
    selected = day;
    miniDate = day;
    render();
  };
  const monthView = createMonthView(content, {
    itemsFor,
    scheduleButton,
    select: selectDay,
    create(day) {
      selectDay(day);
      openSchedule(day);
    },
    showWeek(day) {
      view = 'week';
      selectDay(day);
    },
  });
  const weekView = createWeekView(content, {
    itemsFor,
    scheduleButton,
    select: selectDay,
    canSelect: () => ready && !busy,
    selectRange(day, start, end) {
      selected = day;
      miniDate = day;
      renderMini();
      renderAgenda();
      openSchedule(start, null, true, end);
    },
    createAllDay(day) {
      openSchedule(day);
      $<HTMLInputElement>('#schedule-all-day').checked = true;
      updateAllDay();
    },
  });

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
  function render() {
    weekView.cancelSelection();
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
    if (view === 'month') monthView.render(selected);
    else
      weekView.render(
        selected,
        linkedOnly,
        preferences.weekStartHour,
        resetWeekScroll,
      );
    resetWeekScroll = false;
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
        await options.navigate('events');
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

  render();
  setInterval(weekView.updateNow, 60_000);
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
  const initialized = initialize();
  return {
    initialized,
    root,
    refresh: render,
    cancelSelection: () => weekView.cancelSelection(),
    getPreferences: () => preferences,
    savePreferences(value: typeof preferences) {
      preferences = savePreferences(value);
      view = preferences.defaultView;
      resetWeekScroll = true;
    },
    replaceSchedules(items: Schedule[]) {
      schedules = items;
      render();
    },
  };
}
