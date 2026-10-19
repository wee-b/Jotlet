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

if (process.platform === 'win32')
  app.setAppUserModelId('com.squirrel.jotlet.jotlet');
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;
let dataLocation: DataLocationManager;
let installationHint: string | undefined;

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
  mainWindow = createMainWindow(() => {
    mainWindow = null;
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
    registerHandlers(() => mainWindow, dataLocation, updateInstallationHint);
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
