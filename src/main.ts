import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { EventsStore } from './storage';
import { makeBackup, parseEvent, toMarkdown } from './events';
import type { Result } from './events';
import { ScheduleStore } from './schedule-storage';
import { parseSchedule } from './schedules';
import { DataLocationManager } from './data-location';
import { makeJotletBackup, parseJotletBackup } from './jotlet-backup';

if (process.platform === 'win32')
  app.setAppUserModelId('com.squirrel.jotlet.jotlet');

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
        properties: ['openFile'],
        filters: [{ name: 'Jotlet 专属备份', extensions: ['jotlet'] }],
      });
      if (selection.canceled) return null;
      if (selection.filePaths.length !== 1)
        throw new Error('请单独选择一个 .jotlet 完整备份文件。');
      const filePath = selection.filePaths[0];
      if (path.extname(filePath).toLowerCase() !== '.jotlet')
        throw new Error('仅支持导入 .jotlet 完整备份文件。');
      const fileInfo = await stat(filePath);
      if (!fileInfo.isFile() || fileInfo.size > 20 * 1024 * 1024)
        throw new Error('请选择不超过 20 MB 的 .jotlet 文件。');
      const archive = parseJotletBackup(await readFile(filePath, 'utf8'));
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
        skipped: 0,
        conflicts: 0,
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
    if (format !== 'jotlet' && format !== 'json' && format !== 'markdown')
      throw new Error('导出格式无效。');
    if (fileDialogOpen) return null;
    fileDialogOpen = true;
    try {
      const events = await store.load();
      const extension = format === 'markdown' ? 'md' : format;
      const selection = await dialog.showSaveDialog(mainWindow!, {
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

function createWindow() {
  const iconName = process.platform === 'win32' ? 'jotlet.ico' : 'jotlet.png';
  mainWindow = new BrowserWindow({
    icon: app.isPackaged
      ? path.join(process.resourcesPath, iconName)
      : path.join(app.getAppPath(), 'assets', iconName),
    width: 860,
    height: 580,
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
