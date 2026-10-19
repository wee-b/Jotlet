import { parseEvent } from './events.ts';
import type { EventRecord } from './events.ts';
import { parseSchedule } from './schedules.ts';
import type { Schedule } from './schedules.ts';

export interface JotletBackup {
  format: 'jotlet';
  version: 1;
  exportedAt: string;
  events: EventRecord[];
  schedules: Schedule[];
}
export function parseJotletBackup(text: string): JotletBackup {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('无法读取 .jotlet 文件，文件可能已损坏。');
  }
  const data = value as Partial<JotletBackup> | null;
  if (
    !data ||
    data.format !== 'jotlet' ||
    data.version !== 1 ||
    typeof data.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.exportedAt)) ||
    !Array.isArray(data.events) ||
    !Array.isArray(data.schedules)
  )
    throw new Error('不支持此 .jotlet 文件格式或版本。');
  const events = data.events.map(parseEvent);
  const schedules = data.schedules.map(parseSchedule);
  if (
    new Set(events.map((item) => item.id)).size !== events.length ||
    new Set(schedules.map((item) => item.id)).size !== schedules.length
  )
    throw new Error('.jotlet 文件中存在重复的事件或日程 ID。');
  return {
    format: 'jotlet',
    version: 1,
    exportedAt: new Date(data.exportedAt).toISOString(),
    events,
    schedules,
  };
}
export function makeJotletBackup(
  events: EventRecord[],
  schedules: Schedule[],
): JotletBackup {
  return parseJotletBackup(
    JSON.stringify({
      format: 'jotlet',
      version: 1,
      exportedAt: new Date().toISOString(),
      events,
      schedules,
    }),
  );
}
