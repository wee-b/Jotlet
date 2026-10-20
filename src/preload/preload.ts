import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  EventsAPI,
  CalendarAPI,
  WindowAPI,
  WindowState,
  StorageAPI,
  BackupAPI,
} from '../shared/api';

const storageAPI: StorageAPI = {
  getLocation: () => ipcRenderer.invoke('storage:location'),
  chooseLocation: () => ipcRenderer.invoke('storage:choose-location'),
};
contextBridge.exposeInMainWorld('jotletStorage', storageAPI);

const windowAPI: WindowAPI = {
  integratedTitlebar: process.platform === 'win32',
  command: (action) => ipcRenderer.invoke('window:command', action),
  getState: () => ipcRenderer.invoke('window:state'),
  onStateChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowState) =>
      listener(state);
    ipcRenderer.on('window:state-changed', handler);
    return () => ipcRenderer.removeListener('window:state-changed', handler);
  },
};
contextBridge.exposeInMainWorld('jotletWindow', windowAPI);

const api: EventsAPI = {
  load: () => ipcRenderer.invoke('events:load'),
  save: (event) => ipcRenderer.invoke('events:save', event),
  remove: (id) => ipcRenderer.invoke('events:remove', id),
  exportEvents: (format) => ipcRenderer.invoke('events:export', format),
};

contextBridge.exposeInMainWorld('jotlet', api);
const backupAPI: BackupAPI = {
  chooseFile: () => ipcRenderer.invoke('backup:choose-file'),
  analyze: (filePath) => ipcRenderer.invoke('backup:analyze', filePath),
  commit: (token, mode) => ipcRenderer.invoke('backup:commit', token, mode),
  discard: (token) => ipcRenderer.invoke('backup:discard', token),
  filePath: (file) => webUtils.getPathForFile(file),
  ready: () => ipcRenderer.invoke('backup:ready'),
  busy: () => ipcRenderer.invoke('backup:busy'),
  onOpenFile: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) =>
      listener(filePath);
    ipcRenderer.on('backup:open-file', handler);
    return () => ipcRenderer.removeListener('backup:open-file', handler);
  },
};
contextBridge.exposeInMainWorld('jotletBackup', backupAPI);
const calendar: CalendarAPI = {
  load: () => ipcRenderer.invoke('calendar:load'),
  save: (schedule) => ipcRenderer.invoke('calendar:save', schedule),
  remove: (id) => ipcRenderer.invoke('calendar:remove', id),
};
contextBridge.exposeInMainWorld('jotletCalendar', calendar);
