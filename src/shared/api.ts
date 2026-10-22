import type { EventRecord, ImportSummary } from './events';
import type { Schedule } from './schedules';
import type { BackupPreview, ImportMode } from './import';

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
  exportEvents(): Promise<Result<string | null>>;
}

export interface BackupAPI {
  chooseFile(): Promise<Result<string | null>>;
  analyze(filePath: string): Promise<Result<BackupPreview>>;
  commit(token: string, mode: ImportMode): Promise<Result<ImportSummary>>;
  discard(token: string): Promise<Result<void>>;
  filePath(file: File): string;
  onOpenFile(listener: (filePath: string) => void): () => void;
  ready(): Promise<Result<void>>;
  busy(): Promise<Result<void>>;
}
