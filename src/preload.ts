import { contextBridge, ipcRenderer } from 'electron';
import type { EventsAPI } from './events';

const api: EventsAPI = {
  load: () => ipcRenderer.invoke('events:load'),
  save: (event) => ipcRenderer.invoke('events:save', event),
  remove: (id) => ipcRenderer.invoke('events:remove', id),
  importEvents: () => ipcRenderer.invoke('events:import'),
  exportEvents: (format) => ipcRenderer.invoke('events:export', format),
};

contextBridge.exposeInMainWorld('jotlet', api);
