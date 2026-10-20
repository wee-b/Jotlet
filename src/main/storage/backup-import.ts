import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { makeJotletBackup } from '../../shared/backup.ts';
import type { JotletBackup } from '../../shared/backup.ts';
import { planMerge } from '../../shared/import.ts';
import type { BackupPreview, ImportMode } from '../../shared/import.ts';
import type { ImportSummary } from '../../shared/events.ts';
import type { DataLocationManager } from './data-location.ts';
import { readBackupFile } from './backup-file.ts';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class BackupImport {
  private manager: DataLocationManager;
  private candidate:
    | {
        preview: BackupPreview;
        backup: JotletBackup;
        merged: ReturnType<typeof planMerge>;
        fingerprint: string;
      }
    | undefined;
  constructor(manager: DataLocationManager) {
    this.manager = manager;
  }

  private async current() {
    return {
      location: this.manager.location,
      events: await this.manager.events.load(),
      schedules: await this.manager.schedules.load(),
    };
  }
  async analyze(filePath: string): Promise<BackupPreview> {
    this.candidate = undefined;
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath))
      throw new Error('请选择本机的 .jotlet 文件。');
    const backup = await readBackupFile(filePath);
    const current = await this.current();
    const merged = planMerge(current.events, current.schedules, backup);
    const ids = new Set(backup.events.map((event) => event.id));
    const preview: BackupPreview = {
      token: randomUUID(),
      filePath,
      fileName: path.basename(filePath),
      exportedAt: backup.exportedAt,
      events: backup.events.length,
      entries: backup.events.reduce(
        (count, event) => count + event.entries.length,
        0,
      ),
      schedules: backup.schedules.length,
      orphanSchedules: backup.schedules.filter(
        (schedule) => schedule.eventId && !ids.has(schedule.eventId),
      ).length,
      currentEvents: current.events.length,
      currentSchedules: current.schedules.length,
      eventMerge: merged.eventMerge,
      scheduleMerge: merged.scheduleMerge,
      eventSamples: backup.events.slice(0, 50).map((event) => ({
        title: event.title,
        entries: event.entries.length,
      })),
      scheduleSamples: backup.schedules.slice(0, 50).map((schedule) => ({
        title: schedule.title,
        start: schedule.start,
        linked: !!schedule.eventId && ids.has(schedule.eventId),
      })),
    };
    this.candidate = {
      preview,
      backup,
      merged,
      fingerprint: fingerprint(current),
    };
    return structuredClone(preview);
  }
  discard(token: string) {
    if (this.candidate?.preview.token === token) this.candidate = undefined;
  }
  async commit(token: string, mode: ImportMode): Promise<ImportSummary> {
    if (mode !== 'merge' && mode !== 'replace')
      throw new Error('导入方式无效。');
    const candidate = this.candidate;
    if (!candidate || candidate.preview.token !== token)
      throw new Error('解析结果已失效，请重新解析文件。');
    if (fingerprint(await this.current()) !== candidate.fingerprint)
      throw new Error('本地数据已变化，请重新解析后再导入。');
    const data = mode === 'merge' ? candidate.merged : candidate.backup;
    if (
      mode === 'replace' ||
      candidate.merged.eventMerge.added ||
      candidate.merged.scheduleMerge.added
    )
      await this.manager.replaceData(
        makeJotletBackup(data.events, data.schedules),
      );
    this.candidate = undefined;
    return {
      added:
        mode === 'merge'
          ? candidate.merged.eventMerge.added
          : data.events.length,
      skipped: mode === 'merge' ? candidate.merged.eventMerge.skipped : 0,
      conflicts: mode === 'merge' ? candidate.merged.eventMerge.conflicts : 0,
      events: await this.manager.events.load(),
      schedules: await this.manager.schedules.load(),
      dataPath: this.manager.location.eventsPath,
      directory: this.manager.location.directory,
    };
  }
}
