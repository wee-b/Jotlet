import { scheduleColors } from '../../../shared/schedules.ts';
import type { ScheduleColor } from '../../../shared/schedules.ts';

export interface Preferences {
  defaultView: 'week' | 'month';
  defaultDuration: number;
  defaultColor: ScheduleColor;
  weekStartHour: number;
}
export const defaultPreferences: Readonly<Preferences> = {
  defaultView: 'week',
  defaultDuration: 30,
  defaultColor: 'sage',
  weekStartHour: 8,
};
const storageKey = 'jotlet.preferences.v1';

export function parsePreferences(value: unknown): Preferences {
  const item =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    defaultView: item.defaultView === 'month' ? 'month' : 'week',
    defaultDuration: [30, 60, 90, 120].includes(item.defaultDuration as number)
      ? (item.defaultDuration as number)
      : defaultPreferences.defaultDuration,
    defaultColor:
      typeof item.defaultColor === 'string' &&
      Object.hasOwn(scheduleColors, item.defaultColor)
        ? (item.defaultColor as ScheduleColor)
        : defaultPreferences.defaultColor,
    weekStartHour:
      Number.isInteger(item.weekStartHour) &&
      (item.weekStartHour as number) >= 0 &&
      (item.weekStartHour as number) <= 23
        ? (item.weekStartHour as number)
        : defaultPreferences.weekStartHour,
  };
}
export function loadPreferences(): Preferences {
  try {
    return parsePreferences(
      JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
    );
  } catch {
    return { ...defaultPreferences };
  }
}
export function savePreferences(value: Preferences): Preferences {
  const preferences = parsePreferences(value);
  localStorage.setItem(storageKey, JSON.stringify(preferences));
  return preferences;
}
