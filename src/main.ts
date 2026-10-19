import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { EventsStore } from './storage';
import {
  makeBackup,
  mergeEvents,
  parseBackup,
  parseEvent,
  toMarkdown,
} from './events';
import type { Result, EventRecord } from './events';
import { ScheduleStore } from './schedule-storage';
import { parseSchedule } from './schedules';
import { DataLocationManager } from './data-location';
import { makeJetletBackup, parseJetletBackup } from './jetlet-backup';

if (started || !app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;
let store: EventsStore;
let scheduleStore: ScheduleStore;
let dataLocation: DataLocationManager;
let dataQueue: Promise<unknown> = Promise.resolve();
let fileDialogOpen = false;

function registerHandlers() {
  const handle = <T>(
    channel: string,
    action: (...args: unknown[]) => Promise<T>,
  ) => {
    ipcMain.handle(channel, async (event, ...args): Promise<Result<T>> => {
      if (
        event.sender !== mainWindow?.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame
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
    maximized: mainWindow!.isMaximized() || mainWindow!.isFullScreen(),
  }));
  handle('window:command', async (action) => {
    const window = mainWindow!;
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
    const selection = await dialog.showOpenDialog(mainWindow!, {
      title: '选择数据保存文件夹',
      defaultPath: dataLocation.location.directory,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '保存到此文件夹',
    });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const location = await dataLocation.relocate(selection.filePaths[0]);
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

  handle('events:import', async () => {
    if (fileDialogOpen) return null;
    fileDialogOpen = true;
    try {
      const selection = await dialog.showOpenDialog(mainWindow!, {
        title: '选择要导入的 Jotlet 数据文件',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Jotlet 专属备份', extensions: ['jetlet'] },
          {
            name: '兼容旧版备份 / 文字文件',
            extensions: ['json', 'md', 'txt'],
          },
        ],
      });
      if (selection.canceled) return null;
      const jetletFiles = selection.filePaths.filter(
        (file) => path.extname(file).toLowerCase() === '.jetlet',
      );
      if (jetletFiles.length && selection.filePaths.length !== 1)
        throw new Error('请单独选择一个 .jetlet 完整备份文件。');
      let archive: ReturnType<typeof makeJetletBackup> | undefined;
      const incoming: EventRecord[] = [];
      let totalSize = 0;
      for (const filePath of selection.filePaths) {
        const fileInfo = await stat(filePath);
        totalSize += fileInfo.size;
        if (totalSize > 20 * 1024 * 1024)
          throw new Error('一次最多导入 20 MB，请分批导入。');
        const extension = path.extname(filePath).toLowerCase();
        if (!['.jetlet', '.json', '.md', '.txt'].includes(extension))
          throw new Error('请选择 .jetlet、JSON、Markdown 或 TXT 文件。');
        const text = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
        if (extension === '.jetlet') {
          archive = parseJetletBackup(text);
        } else if (extension === '.json') {
          incoming.push(...parseBackup(text));
        } else {
          const now = new Date().toISOString();
          const occurredAt = fileInfo.mtime.toISOString();
          incoming.push(
            parseEvent({
              id: crypto.randomUUID(),
              title: path.basename(filePath, path.extname(filePath)),
              entries: [
                {
                  id: crypto.randomUUID(),
                  content: text,
                  occurredAt,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
              startedAt: occurredAt,
              endedAt: null,
              pinned: false,
              createdAt: now,
              updatedAt: now,
            }),
          );
        }
      }
      const legacy = mergeEvents([], incoming);
      archive ??= makeJetletBackup(legacy.events, []);
      const destination = await dialog.showOpenDialog(mainWindow!, {
        title: '选择导入后的数据保存文件夹',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: '导入并使用此文件夹',
      });
      if (destination.canceled || !destination.filePaths[0]) return null;
      const location = await dataLocation.restore(
        destination.filePaths[0],
        archive,
      );
      store = dataLocation.events;
      scheduleStore = dataLocation.schedules;
      return {
        added: archive.events.length,
        skipped: legacy.skipped,
        conflicts: legacy.conflicts,
        events: await store.load(),
        schedules: await scheduleStore.load(),
        dataPath: location.eventsPath,
        directory: location.directory,
      };
    } finally {
      fileDialogOpen = false;
    }
  });

  handle('events:export', async (format) => {
    if (format !== 'jetlet' && format !== 'json' && format !== 'markdown')
      throw new Error('导出格式无效。');
    if (fileDialogOpen) return null;
    fileDialogOpen = true;
    try {
      const events = await store.load();
      const extension = format === 'markdown' ? 'md' : format;
      const selection = await dialog.showSaveDialog(mainWindow!, {
        title:
          format === 'jetlet'
            ? '导出 Jotlet 完整备份'
            : format === 'json'
              ? '导出事件 JSON'
              : '导出 Markdown',
        defaultPath: `Jotlet-${new Date().toISOString().slice(0, 10)}.${extension}`,
        filters: [
          {
            name:
              format === 'jetlet'
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
        store.filePath,
        `${store.filePath}.bak`,
        `${store.filePath}.tmp`,
        `${store.filePath}.v1.bak`,
        scheduleStore.filePath,
        `${scheduleStore.filePath}.bak`,
        `${scheduleStore.filePath}.tmp`,
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
        format === 'jetlet'
          ? JSON.stringify(
              makeJetletBackup(events, await scheduleStore.load()),
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 580,
    backgroundColor: '#f7f8f5',
    title: 'Jotlet · 随手记',
    autoHideMenuBar: true,
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          roundedCorners: true,
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const window = mainWindow;
  const sendWindowState = () => {
    if (!window.isDestroyed())
      window.webContents.send('window:state-changed', {
        maximized: window.isMaximized() || window.isFullScreen(),
      });
  };
  window.on('maximize', sendWindowState);
  window.on('unmaximize', sendWindowState);
  window.on('enter-full-screen', sendWindowState);
  window.on('leave-full-screen', sendWindowState);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  mainWindow.webContents.session.webRequest.onBeforeRequest(
    (details, callback) => {
      const url = new URL(details.url);
      const devHost = MAIN_WINDOW_VITE_DEV_SERVER_URL
        ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).host
        : '';
      callback({
        cancel:
          !['file:', 'devtools:'].includes(url.protocol) &&
          !(devHost && url.host === devHost),
      });
    },
  );
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app
  .whenReady()
  .then(async () => {
    dataLocation = new DataLocationManager(app.getPath('userData'));
    await dataLocation.initialize();
    store = dataLocation.events;
    scheduleStore = dataLocation.schedules;
    registerHandlers();
    createWindow();
    app.on('activate', () => {
      if (!mainWindow) createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox(
      '无法打开数据保存位置',
      `请检查保存文件夹是否可访问，原数据不会被覆盖。\n${error instanceof Error ? error.message : String(error)}`,
    );
    app.quit();
  });
app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
