import { addDays, dateKey, weekStart } from '../../../shared/schedules';
import type { Schedule } from '../../../shared/schedules';
import { calendarIcon as svg } from '../../components/icons';
import { beginTimeSelection } from './time-selection';
import { weekdays, today, dayLabel, timeLabel } from './dates';

interface WeekViewOptions {
  itemsFor(day: Date): Schedule[];
  scheduleButton(item: Schedule, type?: string): HTMLButtonElement;
  select(day: Date): void;
  canSelect(): boolean;
  selectRange(day: Date, start: Date, end: Date): void;
  createAllDay(day: Date): void;
}

export function createWeekView(content: HTMLElement, options: WeekViewOptions) {
  const { itemsFor, scheduleButton } = options;
  let selectedDay = new Date();
  let allDayContext = '';
  let allDayExpanded = false;
  let cancelTimeSelection: (() => void) | undefined;
  function render(
    selected: Date,
    linkedOnly: boolean,
    scrollHour: number,
    resetScroll: boolean,
  ) {
    selectedDay = selected;
    const previousScroll = resetScroll
      ? undefined
      : document.querySelector('.week-scroll')?.scrollTop;
    const days = Array.from({ length: 7 }, (_, index) =>
      addDays(weekStart(selected), index),
    );
    content.className = 'week-view';
    const hasAllDay = days.some((day) =>
      itemsFor(day).some((item) => item.allDay),
    );
    const context = `${dateKey(days[0])}:${linkedOnly}:${hasAllDay}`;
    if (context !== allDayContext) {
      allDayContext = context;
      allDayExpanded = hasAllDay;
    }
    content.innerHTML = `
    <div class="week-date-row">
      <div class="week-timezone">
        <span>GMT${-new Date().getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-new Date().getTimezoneOffset() / 60}</span>
        <button type="button" id="toggle-all-day" aria-controls="week-all-day">全天 ${svg('down')}</button>
      </div>
      ${days.map((day) => `<button class="week-date${dateKey(day) === today() ? ' is-today' : ''}${dateKey(day) === dateKey(selected) ? ' is-selected' : ''}" data-week-day="${dateKey(day)}"><span>${weekdays[day.getDay()]}</span><strong>${day.getDate()}</strong></button>`).join('')}
    </div>
    <div class="week-all-day" id="week-all-day"><span>全天</span>${days.map((day) => `<div data-all-day="${dateKey(day)}"></div>`).join('')}</div>
    <div class="week-scroll">
      <div class="week-grid">
        <div class="week-hours">${Array.from({ length: 24 }, (_, hour) => `<span style="top:${hour * 64}px">${String(hour).padStart(2, '0')}:00</span>`).join('')}</div>
        ${days.map((day) => `<div class="week-column${dateKey(day) === today() ? ' is-today' : ''}" data-column="${dateKey(day)}"></div>`).join('')}
        <div class="current-time-line" hidden><span></span></div>
      </div>
    </div>
  `;
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
        options.select(new Date(`${button.dataset.weekDay}T00:00:00`));
      }),
    );
    days.forEach((day) => {
      const column = content.querySelector<HTMLElement>(
        `[data-column="${dateKey(day)}"]`,
      )!;
      const selectRange = (startMinute: number, endMinute: number) => {
        const start = new Date(day);
        const end = new Date(day);
        start.setMinutes(startMinute);
        end.setMinutes(endMinute);
        options.selectRange(day, start, end);
      };
      column.addEventListener('pointerdown', (event) => {
        if (
          !options.canSelect() ||
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
        options.createAllDay(day);
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
      previousScroll ?? scrollHour * 64;
  }
  function updateNow() {
    const line = content.querySelector<HTMLElement>('.current-time-line');
    if (!line) return;
    const now = new Date();
    const start = weekStart(selectedDay);
    line.hidden = !(now >= start && now < addDays(start, 7));
    line.style.top = `${(now.getHours() + now.getMinutes() / 60) * 64}px`;
    line.style.setProperty('--today-column', String(now.getDay()));
    line.querySelector('span')!.textContent = timeLabel(now);
  }

  return { render, updateNow, cancelSelection: () => cancelTimeSelection?.() };
}
