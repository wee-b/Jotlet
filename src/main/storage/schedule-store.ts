import { parseSchedule } from '../../shared/schedules.ts';
import type { Schedule } from '../../shared/schedules.ts';
import { IncrementalStore } from './incremental-store.ts';

export class ScheduleStore extends IncrementalStore<Schedule> {
  constructor(filePath: string) {
    super(
      filePath,
      (text) => {
        const data = JSON.parse(text);
        if (
          data?.app !== 'jotlet-calendar' ||
          ![1, 2].includes(data.version) ||
          !Array.isArray(data.schedules)
        )
          throw new Error('不支持的日历数据格式。');
        const records: Schedule[] = data.schedules.map(parseSchedule);
        if (new Set(records.map((item) => item.id)).size !== records.length)
          throw new Error('存在重复的日程。');
        return {
          records,
          migrationBackup: data.version === 1 ? `${filePath}.bak` : undefined,
        };
      },
      (schedules) => ({ app: 'jotlet-calendar', version: 2, schedules }),
      parseSchedule,
    );
  }
  save(value: Schedule): Promise<Schedule> {
    return this.change(async () => {
      const schedule = parseSchedule(value);
      schedule.createdAt =
        this.records.get(schedule.id)?.createdAt ?? schedule.createdAt;
      schedule.updatedAt = new Date().toISOString();
      await this.commit([schedule]);
      return structuredClone(schedule);
    });
  }
  remove(id: string): Promise<void> {
    return this.change(() => this.commit([], this.records.has(id) ? [id] : []));
  }
}
