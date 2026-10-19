import type { Schedule } from '../../../shared/schedules';
import type { EventRecord } from '../../../shared/events';
import { calendarIcon as svg } from '../../components/icons';
import { timeLabel } from './dates';

export function createScheduleButton(
  item: Schedule,
  getEvents: () => EventRecord[],
  open: (item: Schedule) => void,
  type = 'month-schedule',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `${type} schedule-color-${item.color}`;
  button.dataset.scheduleId = item.id;
  const linkedEvent = getEvents().find((event) => event.id === item.eventId);
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
  button.addEventListener('click', () => open(item));
  return button;
}
