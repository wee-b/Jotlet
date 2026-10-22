import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import { DataLocationManager } from './storage/data-location';
import {
  readInstallation,
  writeInstallationHint,
} from './storage/installation';
import { createMainWindow } from './app-window';
import { registerHandlers } from './ipc';
import { backupFromArguments } from './open-backup';
import { guardDataClose } from './data-operations';
import type { DataOperations } from './data-operations';

if (process.platform === 'win32')
  app.setAppUserModelId('com.squirrel.jotlet.jotlet');
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;
let dataLocation: DataLocationManager;
let installationHint: string | undefined;
let dataOperations: DataOperations;
const pendingFiles: string[] = [];
const initialFile = backupFromArguments(process.argv, process.cwd());
if (initialFile) pendingFiles.push(initialFile);
let rendererReady = false;
let promptingFile = false;

function receiveBackup(filePath: string) {
  if (path.extname(filePath).toLowerCase() !== '.jotlet') return;
  if (!pendingFiles.includes(filePath)) pendingFiles.push(filePath);
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
  void promptNextBackup();
}
async function promptNextBackup() {
  if (!rendererReady || promptingFile || !mainWindow || !pendingFiles.length)
    return;
  promptingFile = true;
  const window = mainWindow;
  const filePath = pendingFiles.shift()!;
  try {
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      title: '导入 Jotlet 备份',
      message: '要导入此文件吗？',
      detail: filePath,
      buttons: ['是，解析文件', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0 && !window.isDestroyed()) {
      rendererReady = false;
      window.webContents.send('backup:open-file', filePath);
    }
  } finally {
    promptingFile = false;
  }
  // Further files remain queued until the parser is closed and signals ready.
  if (rendererReady) void promptNextBackup();
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  receiveBackup(filePath);
});

async function updateInstallationHint() {
  if (installationHint)
    await writeInstallationHint(
      installationHint,
      dataLocation.location.directory,
    ).catch((error) =>
      console.error('Cannot update installer directory hint:', error),
    );
}

function createWindow() {
  rendererReady = false;
  mainWindow = createMainWindow(() => {
    rendererReady = false;
    mainWindow = null;
  });
  guardDataClose(mainWindow, dataOperations, (error) => {
    dialog.showErrorBox(
      '保存失败，窗口已保持打开',
      `请检查保存位置并重试，或从备份恢复。\n${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

app
  .whenReady()
  .then(async () => {
    dataLocation = new DataLocationManager(app.getPath('userData'));
    await dataLocation.initialize();
    if (app.isPackaged && process.platform === 'win32') {
      const installation = await readInstallation(
        path.join(path.dirname(app.getPath('exe')), 'jotlet-install.ini'),
      );
      if (installation) {
        await dataLocation.applyInstallation(installation);
        installationHint = path.join(
          path.dirname(app.getPath('exe')),
          'jotlet-data.ini',
        );
        await updateInstallationHint();
      }
    }
    dataOperations = registerHandlers(
      () => mainWindow,
      dataLocation,
      updateInstallationHint,
      (ready) => {
        rendererReady = ready;
        if (ready) void promptNextBackup();
      },
    );
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
app.on('second-instance', (_event, argv, workingDirectory) => {
  const filePath = backupFromArguments(argv, workingDirectory);
  if (filePath) receiveBackup(filePath);
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
