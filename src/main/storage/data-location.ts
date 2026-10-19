import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { EventsStore } from './event-store.ts';
import { ScheduleStore } from './schedule-store.ts';
import { makeBackup } from '../../shared/events.ts';
import { parseJotletBackup } from '../../shared/backup.ts';
import type { JotletBackup } from '../../shared/backup.ts';
import type { InstallationData } from './installation.ts';
import type { DataLocation } from '../../shared/api.ts';

const dataFiles = [
  'notes.json',
  'notes.json.bak',
  'notes.json.v1.bak',
  'calendar.json',
  'calendar.json.bak',
];
const reservedFiles = [...dataFiles, 'notes.json.tmp', 'calendar.json.tmp'];
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

export class DataLocationManager {
  events!: EventsStore;
  schedules!: ScheduleStore;
  readonly configPath: string;
  private defaultDirectory: string;
  constructor(defaultDirectory: string) {
    this.defaultDirectory = defaultDirectory;
    this.configPath = path.join(defaultDirectory, 'data-location.json');
    this.useDirectory(defaultDirectory);
  }
  private useDirectory(directory: string) {
    this.events = new EventsStore(path.join(directory, 'notes.json'));
    this.schedules = new ScheduleStore(path.join(directory, 'calendar.json'));
  }
  get location(): DataLocation {
    return {
      directory: path.dirname(this.events.filePath),
      eventsPath: this.events.filePath,
      calendarPath: this.schedules.filePath,
    };
  }
  async initialize() {
    let text: string;
    try {
      text = await readFile(this.configPath, 'utf8');
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    const config = JSON.parse(text);
    if (
      config?.version !== 1 ||
      typeof config.directory !== 'string' ||
      !path.isAbsolute(config.directory)
    )
      throw new Error(`数据位置配置无效，请检查 ${this.configPath}。`);
    // A missing custom directory must never silently become an empty database.
    await access(path.join(config.directory, 'notes.json'));
    await access(path.join(config.directory, 'calendar.json'));
    this.useDirectory(config.directory);
  }
  private async emptyTarget(directory: string) {
    if (!path.isAbsolute(directory))
      throw new Error('请选择完整的文件夹路径。');
    const target = await realpath(directory);
    for (const name of reservedFiles) {
      try {
        await access(path.join(target, name));
      } catch (error) {
        if (missing(error)) continue;
        throw error;
      }
      throw new Error(
        '目标文件夹已有 Jotlet 数据，请选择其他文件夹，避免覆盖已有内容。',
      );
    }
    return target;
  }
  async applyInstallation(installation: InstallationData) {
    const appliedPath = path.join(
      this.defaultDirectory,
      'installation-applied.json',
    );
    try {
      const applied = JSON.parse(await readFile(appliedPath, 'utf8'));
      // Settings changes after the first launch take precedence over installer defaults.
      if (applied.token === installation.token) return;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const target = installation.directory;
    await mkdir(target, { recursive: true });
    const canonicalTarget = await realpath(target);
    await mkdir(this.location.directory, { recursive: true });
    const canonicalSource = await realpath(this.location.directory);
    if (canonicalTarget !== canonicalSource) {
      const hasFile = async (name: string) => {
        try {
          await access(path.join(target, name));
          return true;
        } catch (error) {
          if (missing(error)) return false;
          throw error;
        }
      };
      const [hasEvents, hasCalendar] = await Promise.all([
        hasFile('notes.json'),
        hasFile('calendar.json'),
      ]);
      if (hasEvents || hasCalendar) {
        const [events, schedules] = await Promise.all([
          this.events.load(),
          this.schedules.load(),
        ]);
        if (!hasEvents || !hasCalendar || events.length || schedules.length)
          throw new Error(
            '安装时选择的目录已有数据，无法自动覆盖或合并。请保留现有数据并重新选择空文件夹。',
          );
        await this.commitDirectory(canonicalTarget);
      } else {
        await this.relocate(canonicalTarget);
      }
    }
    await mkdir(this.defaultDirectory, { recursive: true });
    await writeFile(`${appliedPath}.tmp`, JSON.stringify(installation), {
      encoding: 'utf8',
      flush: true,
    });
    await rename(`${appliedPath}.tmp`, appliedPath);
  }
  private async commitDirectory(target: string) {
    const nextEvents = new EventsStore(path.join(target, 'notes.json'));
    const nextSchedules = new ScheduleStore(path.join(target, 'calendar.json'));
    await nextEvents.load();
    await nextSchedules.load();
    await mkdir(this.defaultDirectory, { recursive: true });
    await writeFile(
      `${this.configPath}.tmp`,
      JSON.stringify({ version: 1, directory: target }, null, 2),
      { encoding: 'utf8', flush: true },
    );
    await rename(`${this.configPath}.tmp`, this.configPath);
    this.events = nextEvents;
    this.schedules = nextSchedules;
    return this.location;
  }
  async restore(
    directory: string,
    backup: JotletBackup,
  ): Promise<DataLocation> {
    const data = parseJotletBackup(JSON.stringify(backup));
    const target = await this.emptyTarget(directory);
    const created: string[] = [];
    try {
      for (const [name, content] of [
        ['notes.json', makeBackup(data.events)],
        [
          'calendar.json',
          { app: 'jotlet-calendar', version: 2, schedules: data.schedules },
        ],
      ] as const) {
        const output = path.join(target, name);
        const file = await open(output, 'wx');
        created.push(output);
        try {
          await file.writeFile(JSON.stringify(content, null, 2), 'utf8');
          await file.sync();
        } finally {
          await file.close();
        }
      }
      return await this.commitDirectory(target);
    } catch (error) {
      await Promise.allSettled(created.map((file) => unlink(file)));
      throw error;
    }
  }
  // Call under the main process data-operation queue, including saves and exports.
  async relocate(directory: string): Promise<DataLocation> {
    await mkdir(this.location.directory, { recursive: true });
    const source = await realpath(this.location.directory);
    if (source === (await realpath(directory))) return this.location;
    const target = await this.emptyTarget(directory);
    const events = await this.events.load();
    const schedules = await this.schedules.load();
    const created: string[] = [];
    try {
      for (const name of dataFiles) {
        const output = path.join(target, name);
        try {
          await copyFile(
            path.join(source, name),
            output,
            constants.COPYFILE_EXCL,
          );
          created.push(output);
        } catch (error) {
          if (!missing(error)) throw error;
          if (name !== 'notes.json' && name !== 'calendar.json') continue;
          const content =
            name === 'notes.json'
              ? makeBackup(events)
              : { app: 'jotlet-calendar', version: 2, schedules };
          const file = await open(output, 'wx');
          created.push(output);
          try {
            await file.writeFile(JSON.stringify(content, null, 2), 'utf8');
            await file.sync();
          } finally {
            await file.close();
          }
        }
      }
      // The durable pointer commits last; originals remain intact at all times.
      return await this.commitDirectory(target);
    } catch (error) {
      await Promise.allSettled(created.map((file) => unlink(file)));
      throw error;
    }
  }
}
