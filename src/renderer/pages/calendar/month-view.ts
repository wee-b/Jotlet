import { dateKey, monthDays } from '../../../shared/schedules';
import type { Schedule } from '../../../shared/schedules';
import { calendarIcon as svg } from '../../components/icons';
import { weekdays, today, dayLabel } from './dates';

interface MonthViewOptions {
  itemsFor(day: Date): Schedule[];
  scheduleButton(item: Schedule, type?: string): HTMLButtonElement;
  select(day: Date): void;
  create(day: Date): void;
  showWeek(day: Date): void;
}

export function createMonthView(
  content: HTMLElement,
  options: MonthViewOptions,
) {
  const { itemsFor, scheduleButton } = options;
  function render(selected: Date) {
    content.className = 'month-view';
    content.innerHTML = `<div class="month-weekdays">${weekdays.map((name, index) => `<span class="${index === 0 || index === 6 ? 'weekend' : ''}">${name}</span>`).join('')}</div><div class="month-grid" id="month-grid"></div>`;
    const days = monthDays(selected);
    const grid = content.querySelector<HTMLElement>('#month-grid')!;
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
        options.select(day);
      });
      const add = document.createElement('button');
      add.className = 'month-day-add';
      add.innerHTML = svg('plus');
      add.setAttribute('aria-label', `${dayLabel(day)}创建日程`);
      add.addEventListener('click', () => {
        options.create(day);
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
          options.showWeek(day);
        });
        eventList.append(more);
      }
      cell.append(eventList);
      grid.append(cell);
    });
    fit();
  }
  function fit() {
    if (
      content.closest('[hidden]') ||
      !content.classList.contains('month-view')
    )
      return;
    content
      .querySelectorAll<HTMLElement>('.month-day-events')
      .forEach((list) => {
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
          if (height + (count < total ? moreHeight + gap : 0) <= available)
            break;
          count--;
        }
        buttons.forEach((button, index) => (button.hidden = index >= count));
        more.hidden = count === total;
        more.textContent = `还有 ${total - count} 个日程`;
      });
  }

  new ResizeObserver(fit).observe(content);
  return { render };
}
