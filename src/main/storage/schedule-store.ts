import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSchedule } from '../../shared/schedules.ts';
import type { Schedule } from '../../shared/schedules.ts';

export class ScheduleStore {
  private schedules: Schedule[] = [];
  private ready: Promise<void> | undefined;
  private queue: Promise<void> = Promise.resolve();
  readonly filePath: string;
  constructor(filePath: string) {
    this.filePath = filePath;
  }
  private initialize(): Promise<void> {
    this.ready ??= (async () => {
      try {
        const data = JSON.parse(await readFile(this.filePath, 'utf8'));
        if (
          data?.app !== 'jotlet-calendar' ||
          ![1, 2].includes(data.version) ||
          !Array.isArray(data.schedules)
        )
          throw new Error('不支持的日历数据格式。');
        const schedules: Schedule[] = data.schedules.map(parseSchedule);
        if (new Set(schedules.map((item) => item.id)).size !== schedules.length)
          throw new Error('存在重复的日程。');
        this.schedules = schedules;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error(
            `日历数据读取失败，原文件已保留。请检查 ${this.filePath}。`,
            { cause: error },
          );
      }
    })();
    return this.ready;
  }
  private change<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      await this.initialize();
      return operation();
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async persist(schedules: Schedule[]) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(
      `${this.filePath}.tmp`,
      JSON.stringify(
        { app: 'jotlet-calendar', version: 2, schedules },
        null,
        2,
      ),
      { encoding: 'utf8', flush: true },
    );
    try {
      await copyFile(this.filePath, `${this.filePath}.bak`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(`${this.filePath}.tmp`, this.filePath);
    this.schedules = schedules;
  }
  async load(): Promise<Schedule[]> {
    await this.queue;
    await this.initialize();
    return structuredClone(this.schedules);
  }
  save(value: Schedule): Promise<Schedule> {
    return this.change(async () => {
      const schedule = parseSchedule(value);
      schedule.createdAt =
        this.schedules.find((item) => item.id === schedule.id)?.createdAt ??
        schedule.createdAt;
      schedule.updatedAt = new Date().toISOString();
      await this.persist([
        ...this.schedules.filter((item) => item.id !== schedule.id),
        schedule,
      ]);
      return structuredClone(schedule);
    });
  }
  remove(id: string): Promise<void> {
    return this.change(() =>
      this.persist(this.schedules.filter((item) => item.id !== id)),
    );
  }
}
