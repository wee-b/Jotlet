import type { EventRecord, ImportSummary } from './events';
import type { Schedule } from './schedules';

export interface WindowState {
  maximized: boolean;
}

export interface WindowAPI {
  readonly integratedTitlebar: boolean;
  command(action: 'minimize' | 'maximize' | 'close'): Promise<Result<void>>;
  getState(): Promise<Result<WindowState>>;
  onStateChange(listener: (state: WindowState) => void): () => void;
}

export interface DataLocation {
  directory: string;
  eventsPath: string;
  calendarPath: string;
}

export interface StorageAPI {
  getLocation(): Promise<Result<DataLocation>>;
  chooseLocation(): Promise<Result<DataLocation | null>>;
}

export interface CalendarAPI {
  load(): Promise<Result<Schedule[]>>;
  save(schedule: Schedule): Promise<Result<Schedule>>;
  remove(id: string): Promise<Result<void>>;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface EventsAPI {
  load(): Promise<Result<{ events: EventRecord[]; dataPath: string }>>;
  save(event: EventRecord): Promise<Result<EventRecord>>;
  remove(id: string): Promise<Result<void>>;
  importEvents(): Promise<Result<ImportSummary | null>>;
  exportEvents(
    format: 'jotlet' | 'json' | 'markdown',
  ): Promise<Result<string | null>>;
}
