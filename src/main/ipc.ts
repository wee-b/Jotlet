import { dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeBackup, parseEvent, toMarkdown } from '../shared/events';
import type { Result } from '../shared/api';
import { parseSchedule } from '../shared/schedules';
import { makeJotletBackup } from '../shared/backup';
import { BackupImport } from './storage/backup-import';
import type { DataLocationManager } from './storage/data-location';

export function registerHandlers(
  getWindow: () => BrowserWindow | null,
  dataLocation: DataLocationManager,
  updateInstallationHint: () => Promise<void>,
  onBackupReady: (ready: boolean) => void,
) {
  let store = dataLocation.events;
  let scheduleStore = dataLocation.schedules;
  let dataQueue: Promise<unknown> = Promise.resolve();
  let fileDialogOpen = false;
  const handle = <T>(
    channel: string,
    action: (...args: unknown[]) => Promise<T>,
  ) => {
    ipcMain.handle(channel, async (event, ...args): Promise<Result<T>> => {
      const window = getWindow();
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      ) {
        return { ok: false, error: '无法访问本地数据。' };
      }
      try {
        const operation = channel.startsWith('window:')
          ? action(...args)
          : dataQueue.then(() => action(...args));
        if (!channel.startsWith('window:'))
          dataQueue = operation.catch(() => {});
        return { ok: true, data: await operation };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '操作失败，请重试。',
        };
      }
    });
  };

  handle('window:state', async () => ({
    maximized: getWindow()!.isMaximized() || getWindow()!.isFullScreen(),
  }));
  handle('window:command', async (action) => {
    const window = getWindow()!;
    if (action === 'minimize') window.minimize();
    else if (action === 'maximize') {
      if (window.isFullScreen()) window.setFullScreen(false);
      else if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    } else if (action === 'close') {
      // Reply before closing; close() still runs the existing unsaved-data guard.
      setImmediate(() => {
        if (!window.isDestroyed()) window.close();
      });
    } else throw new Error('窗口操作无效。');
  });
  handle('storage:location', async () => dataLocation.location);
  handle('storage:choose-location', async () => {
    const selection = await dialog.showOpenDialog(getWindow()!, {
      title: '选择数据保存文件夹',
      defaultPath: dataLocation.location.directory,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '保存到此文件夹',
    });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const location = await dataLocation.relocate(selection.filePaths[0]);
    await updateInstallationHint();
    store = dataLocation.events;
    scheduleStore = dataLocation.schedules;
    return location;
  });
  handle('calendar:load', () => scheduleStore.load());
  handle('calendar:save', (schedule) =>
    scheduleStore.save(parseSchedule(schedule)),
  );
  handle('calendar:remove', (id) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('日程 ID 无效。');
    return scheduleStore.remove(id);
  });

  handle('events:load', async () => ({
    events: await store.load(),
    dataPath: store.filePath,
  }));
  handle('events:save', async (event) => store.save(parseEvent(event)));
  handle('events:remove', async (id) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('事件 ID 无效。');
    return store.remove(id);
  });

  const backupImport = new BackupImport(dataLocation);
  handle('backup:ready', async () => onBackupReady(true));
  handle('backup:busy', async () => onBackupReady(false));
  handle('backup:choose-file', async () => {
    if (fileDialogOpen) return null;
    fileDialogOpen = true;
    try {
      const selection = await dialog.showOpenDialog(getWindow()!, {
        title: '选择要解析的 Jotlet 备份',
        properties: ['openFile'],
        filters: [{ name: 'Jotlet 专属备份', extensions: ['jotlet'] }],
      });
      return selection.canceled ? null : (selection.filePaths[0] ?? null);
    } finally {
      fileDialogOpen = false;
    }
  });
  handle('backup:analyze', async (filePath) => {
    if (typeof filePath !== 'string') throw new Error('文件路径无效。');
    return backupImport.analyze(filePath);
  });
  handle('backup:discard', async (token) => {
    if (typeof token === 'string') backupImport.discard(token);
  });
  handle('backup:commit', async (token, mode) => {
    if (typeof token !== 'string' || (mode !== 'merge' && mode !== 'replace'))
      throw new Error('导入参数无效。');
    const summary = await backupImport.commit(token, mode);
    store = dataLocation.events;
    scheduleStore = dataLocation.schedules;
    return summary;
  });
  handle('events:export', async (format) => {
    if (format !== 'jotlet' && format !== 'json' && format !== 'markdown')
      throw new Error('导出格式无效。');
    if (fileDialogOpen) return null;
    fileDialogOpen = true;
    try {
      const events = await store.load();
      const extension = format === 'markdown' ? 'md' : format;
      const selection = await dialog.showSaveDialog(getWindow()!, {
        title:
          format === 'jotlet'
            ? '导出 Jotlet 完整备份'
            : format === 'json'
              ? '导出事件 JSON'
              : '导出 Markdown',
        defaultPath: `Jotlet-${new Date().toISOString().slice(0, 10)}.${extension}`,
        filters: [
          {
            name:
              format === 'jotlet'
                ? 'Jotlet 专属备份'
                : format === 'json'
                  ? '事件 JSON'
                  : 'Markdown 文档',
            extensions: [extension],
          },
        ],
      });
      if (selection.canceled || !selection.filePath) return null;
      const outputPath = path.resolve(selection.filePath);
      const protectedPaths = [
        dataLocation.configPath,
        `${dataLocation.configPath}.tmp`,
        ...[
          'notes.json',
          'calendar.json',
          'active-dataset.json',
          'active-dataset.json.tmp',
        ].map((name) => path.join(dataLocation.location.directory, name)),
        store.filePath,
        `${store.filePath}.bak`,
        `${store.filePath}.tmp`,
        `${store.filePath}.v1.bak`,
        store.journalPath,
        `${store.journalPath}.tmp`,
        scheduleStore.filePath,
        `${scheduleStore.filePath}.bak`,
        `${scheduleStore.filePath}.tmp`,
        scheduleStore.journalPath,
        `${scheduleStore.journalPath}.tmp`,
      ];
      if (
        protectedPaths.some(
          (file) =>
            path.resolve(file).toLowerCase() === outputPath.toLowerCase(),
        )
      ) {
        throw new Error('请选择其他导出位置，不能覆盖正在使用的数据文件。');
      }
      const content =
        format === 'jotlet'
          ? JSON.stringify(
              makeJotletBackup(events, await scheduleStore.load()),
              null,
              2,
            )
          : format === 'json'
            ? JSON.stringify(makeBackup(events), null, 2)
            : toMarkdown(events);
      await writeFile(outputPath, content, { encoding: 'utf8', flush: true });
      return outputPath;
    } finally {
      fileDialogOpen = false;
    }
  });
}
