import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { EventsStore } from './storage';
import { makeBackup, parseBackup, parseEvent, toMarkdown } from './events';
import type { Result, EventRecord } from './events';
import { ScheduleStore } from './schedule-storage';
import { parseSchedule } from './schedules';

if (started || !app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;
let store: EventsStore;
let scheduleStore: ScheduleStore;
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
        return { ok: true, data: await action(...args) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '操作失败，请重试。',
        };
      }
    });
  };

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
        title: '导入事件',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Jotlet 备份 / 文字文件', extensions: ['json', 'md', 'txt'] },
        ],
      });
      if (selection.canceled) return null;
      const incoming: EventRecord[] = [];
      let totalSize = 0;
      for (const filePath of selection.filePaths) {
        const fileInfo = await stat(filePath);
        totalSize += fileInfo.size;
        if (totalSize > 20 * 1024 * 1024)
          throw new Error('一次最多导入 20 MB，请分批导入。');
        const extension = path.extname(filePath).toLowerCase();
        if (!['.json', '.md', '.txt'].includes(extension))
          throw new Error('请选择 JSON、Markdown 或 TXT 文件。');
        const text = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
        if (extension === '.json') {
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
      return store.importEvents(incoming);
    } finally {
      fileDialogOpen = false;
    }
  });

  handle('events:export', async (format) => {
    if (format !== 'json' && format !== 'markdown')
      throw new Error('导出格式无效。');
    if (fileDialogOpen) return null;
    fileDialogOpen = true;
    try {
      const events = await store.load();
      const extension = format === 'json' ? 'json' : 'md';
      const selection = await dialog.showSaveDialog(mainWindow!, {
        title: format === 'json' ? '导出完整备份' : '导出 Markdown',
        defaultPath: `Jotlet-${new Date().toISOString().slice(0, 10)}.${extension}`,
        filters: [
          {
            name: format === 'json' ? 'JSON 备份' : 'Markdown 文档',
            extensions: [extension],
          },
        ],
      });
      if (selection.canceled || !selection.filePath) return null;
      const outputPath = path.resolve(selection.filePath);
      const protectedPaths = [
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
        format === 'json'
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
          titleBarOverlay: {
            color: '#f8f9f6',
            symbolColor: '#506550',
            // Leave the 40px topbar's bottom border below the native controls.
            height: 39,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
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

app.whenReady().then(() => {
  store = new EventsStore(path.join(app.getPath('userData'), 'notes.json'));
  scheduleStore = new ScheduleStore(
    path.join(app.getPath('userData'), 'calendar.json'),
  );
  registerHandlers();
  createWindow();
  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});
app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
