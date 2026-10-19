import { app, BrowserWindow } from 'electron';
import path from 'node:path';

export function createMainWindow(onClosed: () => void): BrowserWindow {
  const iconName = process.platform === 'win32' ? 'jotlet.ico' : 'jotlet.png';
  const window = new BrowserWindow({
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
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const devHost = MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).host
      : '';
    callback({
      cancel:
        !['file:', 'devtools:'].includes(url.protocol) &&
        !(devHost && url.host === devHost),
    });
  });
  window.on('closed', onClosed);
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  return window;
}
