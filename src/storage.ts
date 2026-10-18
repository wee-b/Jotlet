import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { makeBackup, mergeEvents, parseData, parseEvent } from './events.ts';
import type { EventRecord, ImportSummary } from './events.ts';

export class EventsStore {
  private events: EventRecord[] = [];
  private ready: Promise<void> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private migrated = false;
  readonly filePath: string;
  constructor(filePath: string) {
    this.filePath = filePath;
  }
  private initialize(): Promise<void> {
    this.ready ??= (async () => {
      try {
        const data = parseData(await readFile(this.filePath, 'utf8'));
        this.events = data.events;
        this.migrated = data.migrated;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error(
            `本地数据读取失败，原文件已保留。请检查 ${this.filePath}；上次写入前的副本位于 ${this.filePath}.bak。`,
            { cause: error },
          );
      }
    })();
    return this.ready;
  }
  private async persist(events: EventRecord[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(
      `${this.filePath}.tmp`,
      JSON.stringify(makeBackup(events), null, 2),
      { encoding: 'utf8', flush: true },
    );
    if (this.migrated) {
      try {
        await copyFile(
          this.filePath,
          `${this.filePath}.v1.bak`,
          constants.COPYFILE_EXCL,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    try {
      await copyFile(this.filePath, `${this.filePath}.bak`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(`${this.filePath}.tmp`, this.filePath);
    this.events = events;
    this.migrated = false;
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
  async load(): Promise<EventRecord[]> {
    await this.queue;
    await this.initialize();
    return structuredClone(this.events);
  }
  save(value: EventRecord): Promise<EventRecord> {
    return this.change(async () => {
      const event = parseEvent(value);
      const previous = this.events.find((item) => item.id === event.id);
      event.createdAt = previous?.createdAt ?? event.createdAt;
      event.updatedAt = new Date().toISOString();
      const events = this.events.filter((item) => item.id !== event.id);
      events.push(event);
      await this.persist(events);
      return structuredClone(event);
    });
  }
  remove(id: string): Promise<void> {
    return this.change(() =>
      this.persist(this.events.filter((event) => event.id !== id)),
    );
  }
  importEvents(incoming: EventRecord[]): Promise<ImportSummary> {
    return this.change(async () => {
      const summary = mergeEvents(this.events, incoming.map(parseEvent));
      if (summary.added) await this.persist(summary.events);
      return structuredClone(summary);
    });
  }
}
