import {
  makeBackup,
  mergeEvents,
  parseData,
  parseEvent,
} from '../../shared/events.ts';
import type { EventRecord, ImportSummary } from '../../shared/events.ts';
import { IncrementalStore } from './incremental-store.ts';

export class EventsStore extends IncrementalStore<EventRecord> {
  constructor(filePath: string) {
    super(
      filePath,
      (text) => {
        const data = parseData(text);
        return {
          records: data.events,
          migrationBackup: data.migrated ? `${filePath}.v1.bak` : undefined,
        };
      },
      makeBackup,
      parseEvent,
    );
  }
  save(value: EventRecord): Promise<EventRecord> {
    return this.change(async () => {
      const event = parseEvent(value);
      event.createdAt =
        this.records.get(event.id)?.createdAt ?? event.createdAt;
      event.updatedAt = new Date().toISOString();
      await this.commit([event]);
      return structuredClone(event);
    });
  }
  remove(id: string): Promise<void> {
    return this.change(() => this.commit([], this.records.has(id) ? [id] : []));
  }
  importEvents(incoming: EventRecord[]): Promise<ImportSummary> {
    return this.change(async () => {
      const summary = mergeEvents(
        [...this.records.values()],
        incoming.map(parseEvent),
      );
      await this.commit(summary.events.slice(this.records.size));
      return structuredClone(summary);
    });
  }
}
