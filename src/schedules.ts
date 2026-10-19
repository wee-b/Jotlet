import type { EventRecord, Result } from './events';

export const scheduleColors = {
  sage: '浅绿',
  sand: '浅杏',
  sky: '浅蓝',
  rose: '浅粉',
  lavender: '浅紫',
};
export type ScheduleColor = keyof typeof scheduleColors;
export interface Schedule {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: ScheduleColor;
  eventId: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}
export interface CalendarAPI {
  load(): Promise<Result<Schedule[]>>;
  save(schedule: Schedule): Promise<Result<Schedule>>;
  remove(id: string): Promise<Result<void>>;
}

export function filterSchedules(
  schedules: Schedule[],
  events: Pick<EventRecord, 'id' | 'title'>[],
  search = '',
  linkedOnly = false,
): Schedule[] {
  const eventTitles = new Map(events.map((event) => [event.id, event.title]));
  const query = search.trim().toLocaleLowerCase();
  return schedules.filter((schedule) => {
    const eventTitle =
      schedule.eventId === null ? undefined : eventTitles.get(schedule.eventId);
    return (
      (!linkedOnly || eventTitle !== undefined) &&
      `${schedule.title}\n${schedule.description}\n${eventTitle ?? ''}`
        .toLocaleLowerCase()
        .includes(query)
    );
  });
}

export function parseSchedule(value: unknown): Schedule {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('日程格式不正确。');
  const item = value as Record<string, unknown>;
  // Read the previous category field only when migrating existing local data.
  const legacyColors = new Map<string, ScheduleColor>([
    ['work', 'sage'],
    ['personal', 'sand'],
    ['life', 'sage'],
  ]);
  const color =
    item.color === undefined
      ? legacyColors.get(item.calendar as string)
      : item.color;
  const validDate = (date: unknown): date is string =>
    typeof date === 'string' && Number.isFinite(Date.parse(date));
  if (
    typeof item.id !== 'string' ||
    !item.id.trim() ||
    item.id.length > 200 ||
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    item.title.length > 500 ||
    !validDate(item.start) ||
    !validDate(item.end) ||
    !validDate(item.createdAt) ||
    !validDate(item.updatedAt) ||
    typeof item.allDay !== 'boolean' ||
    typeof color !== 'string' ||
    !Object.hasOwn(scheduleColors, color) ||
    !(
      item.eventId === null ||
      (typeof item.eventId === 'string' &&
        !!item.eventId.trim() &&
        item.eventId.length <= 200)
    ) ||
    typeof item.description !== 'string' ||
    item.description.length > 100_000
  )
    throw new Error('请检查日程的标题、日期和内容。');
  if (Date.parse(item.end) <= Date.parse(item.start))
    throw new Error('结束时间必须晚于开始时间。');
  return {
    id: item.id,
    title: item.title.trim(),
    start: new Date(item.start).toISOString(),
    end: new Date(item.end).toISOString(),
    allDay: item.allDay,
    color: color as ScheduleColor,
    eventId: item.eventId as string | null,
    description: item.description,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
  };
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
export function weekStart(date: Date): Date {
  return addDays(date, -date.getDay());
}
export function monthDays(date: Date, fixed = false): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = weekStart(first);
  const total = fixed
    ? 42
    : Math.ceil(
        (first.getDay() +
          new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) /
          7,
      ) * 7;
  return Array.from({ length: total }, (_, index) => addDays(start, index));
}
// End dates are exclusive, so an event ending at midnight does not occupy the following day.
export function onDay(schedule: Schedule, day: Date): boolean {
  return (
    Date.parse(schedule.start) < addDays(day, 1).getTime() &&
    Date.parse(schedule.end) > addDays(day, 0).getTime()
  );
}
